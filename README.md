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

## Executar localmente

Use uma extensão de servidor estático, como Live Server no VS Code, e abra `index.html`. Não abra o arquivo diretamente pelo gerenciador de arquivos, pois módulos JavaScript e Firebase precisam de um servidor HTTP.

## Publicar

O projeto pode ser publicado no Firebase Hosting ou em qualquer hospedagem estática. Publique `index.html`, `styles.css`, `script.js` e `firebase.js` mantendo os arquivos no mesmo diretório.
