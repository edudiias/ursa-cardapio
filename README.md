# Cardápio do Ursa Bar — editor 1.0

O cardápio público continua em `index.html`, com o mesmo visual e endereço. O QR Code existente continua válido. Os 54 produtos originais foram extraídos para `cardapio.json`, preservando nomes, descrições, categorias, preços e ordem. Todos começam ativos; o item originalmente sem preço continua mostrando **Consulte**.

## Usar o editor

1. Abra `editor.html` no mesmo site do cardápio, ou no servidor local explicado abaixo.
2. Busque um produto pelo nome e clique em **Editar**. Altere os campos e clique em **Salvar produto**.
3. Para cadastrar, clique em **Novo produto**, preencha nome, categoria e preço e salve. A descrição é opcional. Para um item sem preço, marque **Sem preço definido**; o público verá **Consulte**.
4. Use **Pausar** para esconder um produto do público, mantendo seus dados. Use **Ativar** para exibi-lo novamente. **Excluir** pede confirmação.
5. Em **Categorias**, adicione nomes, renomeie ou use as setas para mudar a ordem. Renomear também atualiza os produtos. Para excluir uma categoria, primeiro mova ou exclua todos os produtos dela, inclusive os pausados.
6. Faça quantas alterações quiser e clique em **Exportar cardapio.json** ao terminar. Um formulário de produto ainda preenchido será validado e salvo antes do download. Adicione ou limpe uma nova categoria ainda não cadastrada antes de exportar.
7. Confira o arquivo baixado na pasta Downloads. Alguns navegadores acrescentam um número ao nome; para publicar, o nome deve ser exatamente `cardapio.json`.

**Salvar produto guarda somente nesta sessão do navegador.** Há um aviso de alterações não exportadas e uma tentativa de impedir a saída acidental. Fechar ou recarregar a página perde os dados não baixados; celulares podem encerrar o navegador sem mostrar o aviso. Exporte com frequência. Não há armazenamento permanente automático. O aviso é limpo quando o download é solicitado; confira que ele realmente terminou.

**Importar JSON** permite retomar um arquivo exportado. A importação valida todos os dados e pede confirmação antes de substituir a sessão inteira. Arquivos inválidos não alteram o trabalho atual. Limite: 5 MB. Um arquivo importado diferente do carregado inicialmente fica marcado como pendente de exportação.

## Publicar sem mudar o endereço ou o QR Code

O editor é local e **não possui autenticação**: qualquer visitante pode abrir a página e editar sua própria cópia. Ele não grava no servidor, não faz login e não acessa a API do GitHub. Somente alguém autorizado no repositório pode publicar. Não coloque senhas, tokens ou informações confidenciais no editor ou no JSON; os arquivos do site são públicos.

1. Exporte o arquivo e guarde uma cópia do `cardapio.json` atualmente publicado como backup.
2. No GitHub, abra `edudiias/ursa-cardapio` e crie uma **nova branch a partir de `main`**.
3. Nessa branch, use **Add file → Upload files** para substituir somente o arquivo `cardapio.json` na raiz pelo arquivo exportado. Confirme o nome e registre a alteração.
4. Abra um Pull Request para `main`. Confira as diferenças de produtos, preços e categorias e valide a branch conforme a seção seguinte. Peça a revisão de uma pessoa autorizada.
5. Após aprovação, essa pessoa pode mesclar o PR. Aguarde a publicação existente do GitHub Pages e confira o endereço público habitual, inclusive pelo QR Code atual.

Não renomeie `index.html`, não altere a configuração de endereço do GitHub Pages, não crie outro site e não gere outro QR Code. O editor 1.0 não exige backend, build ou alteração da configuração de publicação. Para desfazer uma atualização de dados, publique o backup do JSON pelo mesmo processo de branch e PR.

## Validar antes de publicar

Baixe ou faça checkout da branch do PR. Na pasta do projeto, inicie um servidor estático; com Python instalado:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Abra [o cardápio local](http://127.0.0.1:8000/) e [o editor local](http://127.0.0.1:8000/editor.html). Não abra os HTMLs por duplo clique: o carregamento de JSON depende de HTTP/HTTPS.

- Confira os produtos e preços originais no cardápio e teste a busca e os filtros por categoria.
- No editor, altere um produto e cadastre outro; salve ambos antes de exportar. Confira o aviso de pendência.
- Pause e ative um produto. Cancele uma exclusão para conferir a confirmação; depois confirme a exclusão de um produto de teste.
- Adicione, renomeie e reordene uma categoria. Tente excluir uma categoria ocupada e outra vazia.
- Teste nome vazio, preço negativo e texto no preço. Devem ser rejeitados. Teste também a opção **Consulte**.
- Exporte, recarregue o editor e importe o arquivo baixado. Confira se todas as alterações foram mantidas. Tente importar um JSON inválido e confira se os dados anteriores continuam presentes.
- Para conferir o público com as alterações, substitua **somente na cópia local da branch** o `cardapio.json` pelo exportado e recarregue o cardápio. Somente ativos devem aparecer e a ordem das categorias deve ser respeitada.
- Repita em uma tela de celular. Antes de mesclar este PR de implementação, descarte os dados de teste e confirme que os 54 produtos originais continuam no JSON entregue.

## Testes automatizados

O site não tem dependências externas em produção. Os testes de dados usam Node.js 22 ou superior e não precisam de instalação:

```sh
node --test tests/menu.test.cjs
```

Os testes em navegador usam Playwright somente em desenvolvimento:

```sh
npm install
npx playwright install chromium
npm test
npm run test:browser
```

Opcionalmente use um navegador instalado: `BROWSER_CHANNEL=msedge` ou `BROWSER_CHANNEL=chrome` (no PowerShell: `$env:BROWSER_CHANNEL='msedge'`). A comparação visual usa o `index.html` original do commit `4f7adab`, portanto mantenha esse commit no histórico local; em clones rasos, baixe o histórico antes do teste.

A suíte de navegador serve o projeto em `/ursa-cardapio/`, como no GitHub Pages. Ela verifica carregamento e igualdade visual com o original, edição, inclusão, exclusão confirmada/cancelada, pausa/ativação, categorias, importação/exportação, proteção de dados, texto literal com HTML, falhas de carregamento e tela móvel de 390 px. As capturas ficam em `test-results/` (fora do Git).

## Formato de `cardapio.json`

```json
{
  "versao": 1,
  "categorias": ["BEBIDAS"],
  "produtos": [
    {
      "id": "produto-exemplo",
      "categoria": "BEBIDAS",
      "nome": "Água",
      "descricao": "",
      "preco": "R$ 7,00",
      "ativo": true
    }
  ]
}
```

Cada produto tem ID único, nome não vazio, categoria cadastrada, descrição em texto, preço em texto e `ativo` booleano. Preço vazio significa **Consulte**. O editor aceita valores de `0,00` a `999.999,99`, com no máximo duas casas decimais. Não use categorias duplicadas, nem mesmo com diferença apenas de maiúsculas. A ordem de `categorias` determina a ordem no público; dentro da categoria, vale a ordem dos produtos. Categorias vazias ou com todos os produtos pausados não aparecem no público. Os textos são renderizados com `textContent`, sem interpretar HTML.
