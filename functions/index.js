const admin = require('firebase-admin');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { pendingNotices } = require('./lib');

admin.initializeApp();

const db = admin.firestore();
const EMAILJS_PRIVATE_KEY = defineSecret('EMAILJS_PRIVATE_KEY');

function getSchoolSettings(schoolData = {}) {
  return {
    name: schoolData.name || 'Biblioteca escolar',
    coordinationEmail: schoolData.coordinationEmail || '',
    reminderDays: Number(schoolData.reminderDays ?? schoolData.reminderBeforeDays ?? 1),
    coordinationDays: Number(schoolData.coordinationDays ?? schoolData.coordinationAfterDays ?? 7),
    studentTemplateId: schoolData.studentTemplateId || schoolData.emailjs?.studentTemplateId || 'template_s1sr3xs',
    coordinationTemplateId: schoolData.coordinationTemplateId || schoolData.emailjs?.coordinationTemplateId || schoolData.studentTemplateId || schoolData.emailjs?.studentTemplateId || 'template_s1sr3xs',
    serviceId: schoolData.serviceId || schoolData.emailjs?.serviceId || process.env.EMAILJS_SERVICE_ID || 'service_vpiw60w'
  };
}

async function sendEmailJs(email, templateId, serviceId, userId, templateParams) {
  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: userId,
      accessToken: userId,
      template_params: {
        ...templateParams,
        to_email: email
      }
    })
  });

  if (response.status !== 200) {
    const text = await response.text();
    throw new Error(`EmailJS respondeu com ${response.status}: ${text}`);
  }

  return true;
}

async function resolveLoanSchool(loan) {
  if (!loan.schoolId) {
    return getSchoolSettings();
  }

  const schoolSnap = await db.collection('schools').doc(loan.schoolId).get();
  if (!schoolSnap.exists) {
    return getSchoolSettings();
  }

  return getSchoolSettings(schoolSnap.data());
}

exports.onSchedule = onSchedule(
  {
    schedule: '0 8 * * *',
    timeZone: 'America/Fortaleza',
    secrets: [EMAILJS_PRIVATE_KEY],
    region: 'southamerica-east1'
  },
  async () => {
    try {
      const emailjsPrivateKey = EMAILJS_PRIVATE_KEY.value();
      const loansSnap = await db.collection('loans').where('status', '==', 'active').get();

      for (const loanDoc of loansSnap.docs) {
        const loan = { id: loanDoc.id, ...loanDoc.data() };
        const schoolSettings = await resolveLoanSchool(loan);
        const rules = {
          reminderDays: schoolSettings.reminderDays,
          coordinationDays: schoolSettings.coordinationDays
        };
        const pending = pendingNotices(loan, new Date(), rules);
        const notices = { ...(loan.notices || {}) };
        const updates = {};
        const readerSnap = loan.readerId ? await db.collection('readers').doc(loan.readerId).get() : null;
        const reader = readerSnap && readerSnap.exists ? readerSnap.data() : {};
        const readerEmail = reader.email || loan.readerEmail || '';
        const schoolName = schoolSettings.name || 'Biblioteca escolar';

        if (pending.reminder && !notices.reminder && readerEmail) {
          try {
            await sendEmailJs(
              readerEmail,
              schoolSettings.studentTemplateId,
              schoolSettings.serviceId,
              emailjsPrivateKey,
              {
                to_name: loan.readerName || reader.name || 'Leitor',
                subject: 'Aviso de biblioteca',
                message: `Olá, ${loan.readerName || reader.name || 'leitor'}! O empréstimo do livro "${loan.bookTitle || 'Livro'}" vence em ${loan.days || 7} dias.`,
                school_name: schoolName,
                organization: 'Libris',
                livro: loan.bookTitle || '',
                loan_days: Number(loan.days || 0),
                data_vencimento: loan.dueAt && loan.dueAt.toDate ? loan.dueAt.toDate().toLocaleDateString('pt-BR') : new Date(loan.dueAt).toLocaleDateString('pt-BR')
              }
            );
            notices.reminder = true;
            updates.reminder = true;
          } catch (error) {
            logger.warn(`Falha ao enviar lembrete para o empréstimo ${loan.id}:`, error);
          }
        }

        if (pending.overdue && !notices.overdue && readerEmail) {
          try {
            await sendEmailJs(
              readerEmail,
              schoolSettings.studentTemplateId,
              schoolSettings.serviceId,
              emailjsPrivateKey,
              {
                to_name: loan.readerName || reader.name || 'Leitor',
                subject: 'Empréstimo em atraso',
                message: `Olá, ${loan.readerName || reader.name || 'leitor'}! O empréstimo do livro "${loan.bookTitle || 'Livro'}" está em atraso. Favor regularizar a devolução o quanto antes.`,
                school_name: schoolName,
                organization: 'Libris',
                livro: loan.bookTitle || '',
                loan_days: Number(loan.days || 0),
                data_vencimento: loan.dueAt && loan.dueAt.toDate ? loan.dueAt.toDate().toLocaleDateString('pt-BR') : new Date(loan.dueAt).toLocaleDateString('pt-BR')
              }
            );
            notices.overdue = true;
            updates.overdue = true;
          } catch (error) {
            logger.warn(`Falha ao enviar atraso para o empréstimo ${loan.id}:`, error);
          }
        }

        if (pending.coordination && !notices.coordination && schoolSettings.coordinationEmail) {
          try {
            await sendEmailJs(
              schoolSettings.coordinationEmail,
              schoolSettings.coordinationTemplateId,
              schoolSettings.serviceId,
              emailjsPrivateKey,
              {
                to_name: 'Coordenação',
                subject: 'Empréstimo em atraso - coordenação',
                message: `O empréstimo do livro "${loan.bookTitle || 'Livro'}" para ${loan.readerName || reader.name || 'o leitor'} está atrasado. Solicita-se acompanhamento junto ao aluno.`,
                school_name: schoolName,
                organization: 'Libris',
                livro: loan.bookTitle || '',
                loan_days: Number(loan.days || 0),
                data_vencimento: loan.dueAt && loan.dueAt.toDate ? loan.dueAt.toDate().toLocaleDateString('pt-BR') : new Date(loan.dueAt).toLocaleDateString('pt-BR')
              }
            );
            notices.coordination = true;
            updates.coordination = true;
          } catch (error) {
            logger.warn(`Falha ao enviar aviso de coordenação para o empréstimo ${loan.id}:`, error);
          }
        }

        if (Object.keys(updates).length > 0) {
          await db.collection('loans').doc(loan.id).update({
            notices,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }

      return null;
    } catch (error) {
      logger.error('Erro no agendamento de lembretes do Libris:', error);
      throw error;
    }
  }
);
