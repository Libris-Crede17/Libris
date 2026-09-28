# Memória do projeto Libris

## Visão geral

Este projeto foi evoluído para incluir:
- Cloud Functions do Firebase
- lógica de lembretes automáticos
- integração com EmailJS
- regras de segurança mais rígidas no Firestore
- painel admin com configurações da escola
- reset do ciclo de avisos em renovações de empréstimo

## 1) Sistema de lembretes automáticos

A principal funcionalidade adicionada foi a automação de avisos sobre empréstimos em atraso.

### Estratégia
- O sistema analisa empréstimos ativos
- calcula se o empréstimo está em estado de:
  - lembrete
  - atraso
  - aviso à coordenação
- envia e-mails automaticamente via Cloud Function agendada
- registra em `notices` o que já foi enviado

### Fuso de Fortaleza
A lógica de datas foi preparada para considerar o fuso de Fortaleza (`UTC-3`).
Isso evita inconsistências entre horários reais e cálculo de vencimento.

## 2) Arquivo de lógica isolada: functions/lib.js

Esse módulo foi pensado para ser testável e independente do Firebase.

### Funções principais

#### `diffInDays(start, end)`
Calcula a diferença em dias, respeitando o fuso de Fortaleza.

#### `pendingNotices(loan, now, rules)`
Recebe:
- o empréstimo
- a data atual
- as regras da escola

Retorna um objeto indicando quais avisos estão pendentes:

```js
{
  reminder: true,
  overdue: false,
  coordination: false
}
```

### Regras de negócio
- `reminder`: enviado 1 dia antes do vencimento
- `overdue`: enviado quando o prazo já passou
- `coordination`: enviado quando o atraso ultrapassa o limite configurado pela escola

## 3) Cloud Function: functions/index.js

A função agendada fica em:
- `functions/index.js`

### Configuração do agendamento
Foi configurada para rodar todos os dias às 08:00 no fuso `America/Fortaleza`.

### Fluxo da função
1. Busca empréstimos ativos no Firestore
2. Resolve regras da escola vinculada ao empréstimo
3. Chama `pendingNotices(...)`
4. Envia e-mail para o leitor ou para a coordenação
5. Atualiza o campo `notices` do empréstimo no Firestore

### EmailJS
A integração usa a API REST do EmailJS:

```js
https://api.emailjs.com/api/v1.0/email/send
```

A chave privada é obtida a partir de um secret do Firebase:

```js
defineSecret('EMAILJS_PRIVATE_KEY')
```

## 4) Reset ao renovar empréstimo

Um ponto crítico da funcionalidade era reiniciar o ciclo de avisos quando o empréstimo era renovado.

Por isso, ao chamar a renovação, o frontend passou a atualizar:

```js
notices: {}
```

Isso garante que:
- o sistema não reuse avisos já enviados
- o ciclo comece do zero para o novo prazo
- o aluno não receba lembretes antigos após renovação

## 5) Configurações da escola

No painel administrativo, foi incluída a aba "Configurações".

### Campos adicionados
- `coordinationEmail`
- `reminderDays`
- `coordinationDays`

Esses valores são salvos no documento da escola, por exemplo em:

```js
schools/escola-padrao
```

## 6) Regras do Firestore

O arquivo `firestore.rules` foi reforçado para evitar brechas de segurança.

### Principais melhorias
- somente usuários autenticados entram no fluxo
- somente admins podem criar/alterar dados sensíveis
- verificação de estoque e totais dos livros
- regras mais restritas para `schools`
- `loans` só aceitam atualizações esperadas
- `notices` não pode ser alterado livremente pelo frontend

## 7) Painel admin

A interface foi ajustada para permitir que o admin configure a escola e o comportamento dos lembretes sem mexer em código.

Isso reduz dependência de manutenção manual e melhora a experiência de operação do sistema escolar.

## 8) O comportamento final do sistema

O fluxo ficou assim:

1. Empréstimo ativo é registrado
2. O sistema analisa a data de vencimento
3. calcula se o aluno precisa receber aviso de lembrete
4. se atrasado, envia aviso de atraso
5. se o atraso ultrapassar o limite da coordenação, envia alerta para a coordenação
6. registra tudo em `notices`
7. ao renovar, `notices` volta a `{}` e o ciclo reinicia

## 9) Resultado

O projeto passou a ter:
- automação real de envio
- regras de segurança mais robustas
- manutenção mais simples
- ajustes de negócio configuráveis pela escola
- rastreio dos e-mails disparados por empréstimo

## 10) Observação

A implementação foi pensada para funcionar com Firebase Functions e EmailJS em ambiente real, respeitando o uso de secret no Firebase, sem expor a chave privada no front-end.

Este arquivo serve como documentação interna do que foi desenvolvido e do raciocínio usado na solução.
