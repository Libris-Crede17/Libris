const DAY_IN_MS = 24 * 60 * 60 * 1000;
const { FieldValue } = require('firebase-admin/firestore');

function toFortalezaDate(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const dateParts = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  if (!dateParts.year || !dateParts.month || !dateParts.day) {
    return null;
  }

  return new Date(`${dateParts.year}-${dateParts.month}-${dateParts.day}T00:00:00-03:00`);
}

function diffInDays(startValue, endValue) {
  const startDate = toFortalezaDate(startValue);
  const endDate = toFortalezaDate(endValue);

  if (!startDate || !endDate) {
    return 0;
  }

  return Math.round((endDate.getTime() - startDate.getTime()) / DAY_IN_MS);
}

function pendingNotices(loan, now, rules = {}) {
  if (!loan || loan.status !== 'active') {
    return { reminder: false, overdue: false, coordination: false };
  }

  const notices = loan.notices || {};
  const reminderDays = Number(rules.reminderDays ?? rules.reminderBeforeDays ?? 1);
  const coordinationDays = Number(rules.coordinationDays ?? rules.coordinationAfterDays ?? 7);
  const dueDate = toFortalezaDate(loan.dueAt);
  const referenceNow = toFortalezaDate(now) || new Date(now);

  if (!dueDate) {
    return { reminder: false, overdue: false, coordination: false };
  }

  const daysUntilDue = diffInDays(referenceNow, dueDate);
  const overdueDays = Math.max(0, diffInDays(dueDate, referenceNow));

  const pending = {
    reminder: false,
    overdue: false,
    coordination: false
  };

  if (daysUntilDue === reminderDays && daysUntilDue > 0 && !notices.reminder) {
    pending.reminder = true;
  }

  if (overdueDays >= 1 && !notices.overdue) {
    pending.overdue = true;
  }

  if (overdueDays >= coordinationDays && !notices.coordination) {
    pending.coordination = true;
  }

  return pending;
}

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

async function resolveLoanSchool(db, loan) {
  if (!loan.schoolId) {
    return getSchoolSettings();
  }

  const schoolSnap = await db.collection('schools').doc(loan.schoolId).get();
  if (!schoolSnap.exists) {
    return getSchoolSettings();
  }

  return getSchoolSettings(schoolSnap.data());
}

async function checkAndSendNotifications(db, emailJsPrivateKey) {
  if (!db || typeof db.collection !== 'function') {
    throw new Error('checkAndSendNotifications exige uma instância do Firestore válida.');
  }

  const loansSnap = await db.collection('loans').where('status', '==', 'active').get();

  for (const loanDoc of loansSnap.docs) {
    const loan = { id: loanDoc.id, ...loanDoc.data() };
    const schoolSettings = await resolveLoanSchool(db, loan);
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
          emailJsPrivateKey,
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
        console.warn(`Falha ao enviar lembrete para o empréstimo ${loan.id}:`, error);
      }
    }

    if (pending.overdue && !notices.overdue && readerEmail) {
      try {
        await sendEmailJs(
          readerEmail,
          schoolSettings.studentTemplateId,
          schoolSettings.serviceId,
          emailJsPrivateKey,
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
        console.warn(`Falha ao enviar atraso para o empréstimo ${loan.id}:`, error);
      }
    }

    if (pending.coordination && !notices.coordination && schoolSettings.coordinationEmail) {
      try {
        await sendEmailJs(
          schoolSettings.coordinationEmail,
          schoolSettings.coordinationTemplateId,
          schoolSettings.serviceId,
          emailJsPrivateKey,
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
        console.warn(`Falha ao enviar aviso de coordenação para o empréstimo ${loan.id}:`, error);
      }
    }

    if (Object.keys(updates).length > 0) {
      await db.collection('loans').doc(loan.id).update({
        notices,
        updatedAt: FieldValue.serverTimestamp()
      });
    }
  }

  return null;
}

module.exports = { checkAndSendNotifications };
