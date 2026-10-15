# Multimeios Digital

Sistema escolar de biblioteca da CREDE, feito com HTML, CSS, JavaScript puro, Firebase Authentication e Cloud Firestore.

## Configuração Firebase

1. No Firebase Console do projeto `librisce`, ative **Authentication > Email/Password**.
2. Crie o usuário administrativo em Authentication e anote o UID.
3. Crie manualmente `users/{UID}` no Firestore. O perfil deve conter `role: "admin"` e o `schoolId` correto; o cliente não pode criar ou alterar perfis.
4. Crie o documento `schools/escola-padrao` com, pelo menos:

```json
{
  "name": "Nome da escola",
  "active": true,
  "bookSequences": {}
}
```

5. Publique o conteúdo de `firestore.rules` nas regras do Firestore.
6. Se a escola usar outro identificador, configure o mesmo `schoolId` no perfil do administrador e em `script.js`.

Em uma base já existente, faça backup e confira que todos os documentos administrativos tenham o `schoolId` correto antes de publicar as regras. Documentos sem esse campo serão negados; faça o backfill por escola usando o Admin SDK e valide os dados antes do deploy.

## Migração de dados legados

Execute a migração com credenciais do Firebase Admin SDK e informe explicitamente a escola de destino:

```sh
SCHOOL_ID=escola-padrao node migrate.js
```

Todos os documentos migrados e registros de auditoria recebem esse `schoolId`; a migração falha se a variável não estiver definida.

## Capas, sinopses e avisos por e-mail

Ao cadastrar um livro, o sistema busca automaticamente capa e descrição pelo título, autor e editora. A primeira fonte é o Google Books; se não houver resultado, ele tenta a Open Library. Se nenhuma fonte encontrar o livro, o cadastro continua normalmente sem esses dados.

O aviso ao leitor funciona pelo EmailJS com o template configurado em `studentTemplateId`. O botão **Avisar coordenação** usa `coordinationTemplateId`; se ele estiver vazio, reutiliza o template do aluno. Para ativar esse aviso, adicione `coordinationEmail` ao documento da escola:

```json
{
  "name": "Nome da escola",
  "active": true,
  "bookSequences": {},
  "coordinationEmail": "coordenacao@escola.edu.br"
}
```

Os templates do EmailJS devem aceitar estas variáveis: `to_email`, `to_name`, `subject`, `message`, `school_name`, `organization`, `livro`, `loan_days` e `data_vencimento`. O envio atual é acionado pelo administrador ao clicar no botão de notificação; ele não é um agendamento automático em segundo plano. Para avisos automáticos mesmo com o site fechado, será necessário criar uma Cloud Function ou outro serviço agendado no Firebase.

## Executar localmente

Use uma extensão de servidor estático, como Live Server no VS Code, e abra `index.html`. Não abra o arquivo diretamente pelo gerenciador de arquivos, pois módulos JavaScript e Firebase precisam de um servidor HTTP.

## Publicar

Instale e autentique o Firebase CLI, gere a pasta permitida para publicação e publique apenas o Hosting:

```sh
npm install -g firebase-tools
firebase login
npm run build:hosting
firebase deploy --only hosting
```

Depois do deploy, abra a URL HTTPS do Firebase Hosting no próprio celular, entre com o administrador da escola e escolha **Empréstimos > Escanear QR code > Câmera deste aparelho**. O navegador usará a câmera traseira, sem cabo, pareamento ou transmissão de vídeo ao computador. Aceite a permissão de câmera quando o navegador pedir. A URL HTTPS é necessária para liberar a câmera; `http://localhost` funciona no computador, mas não substitui a URL HTTPS no celular.

O build de Hosting copia somente `index.html`, `styles.css`, `script.js`, `firebase.js` e o favicon para `dist/`, sem publicar scripts de migração, chaves de serviço ou arquivos de desenvolvimento.
