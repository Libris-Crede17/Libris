# Multimeios Digital

Sistema escolar de biblioteca da CREDE, feito com HTML, CSS, JavaScript puro, Firebase Authentication e Cloud Firestore.

## Configuração Firebase

1. No Firebase Console do projeto `libris-biblioteca`, ative **Authentication > Email/Password**.
2. Crie um usuário administrativo em Authentication.
3. Crie o banco Cloud Firestore.
4. Publique o conteúdo de `firestore.rules` nas regras do Firestore.
5. Crie o documento `schools/escola-padrao` com, pelo menos:

```json
{
  "name": "Nome da escola",
  "active": true,
  "bookSequences": {}
}
```

6. Se a escola usar outro identificador, altere `currentSchoolId` no início de `script.js`.

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

O projeto pode ser publicado no Firebase Hosting ou em qualquer hospedagem estática. Publique `index.html`, `styles.css`, `script.js` e `firebase.js` mantendo os arquivos no mesmo diretório.
