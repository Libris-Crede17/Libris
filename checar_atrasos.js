import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

// 1. Cria um carregador nativo para arquivos CommonJS
const require = createRequire(import.meta.url);
const lib = require('./functions/lib.js');

// 2. Extrai a função (lidando com as diferentes formas que o Node pode exportar)
const checkAndSendNotifications = lib.checkAndSendNotifications || lib.default?.checkAndSendNotifications;

if (!checkAndSendNotifications) {
  console.error("❌ Erro fatal: A função 'checkAndSendNotifications' não foi encontrada dentro de 'functions/lib.js'. Verifique se ela está sendo exportada corretamente com 'module.exports = { checkAndSendNotifications };'");
  process.exit(1);
}

// 3. Lê a chave de serviço
const serviceAccount = JSON.parse(readFileSync('./serviceAccountKey.json', 'utf-8'));

// 4. Inicializa a conexão com o Firebase usando permissão de Administrador
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Sua chave privada do EmailJS (Mantenha segura)
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_KEY;

if (!EMAILJS_PRIVATE_KEY) {
  console.error('❌ EMAILJS_KEY não encontrado. Defina a variável de ambiente antes de executar o script. Exemplo: EMAILJS_KEY=...');
  process.exit(1);
}

async function iniciarVarredura() {
  console.log("🔍 Iniciando varredura de empréstimos (Libris)...");
  
  try {
    await checkAndSendNotifications(db, EMAILJS_PRIVATE_KEY);
    console.log("✅ Varredura e disparos de e-mails concluídos com sucesso!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Erro durante a execução da varredura:", error);
    process.exit(1);
  }
}

iniciarVarredura();