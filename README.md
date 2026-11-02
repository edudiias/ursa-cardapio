# Cardápio do Ursa Bar — editor 1.1

O cardápio público continua em `index.html`, com o mesmo visual e endereço. O QR Code existente continua válido. Os 54 produtos originais foram extraídos para `cardapio.json`, preservando nomes, descrições, categorias, preços e ordem. Todos começam ativos; o item originalmente sem preço continua mostrando **Consulte**.

A versão 1.1 adiciona publicação direta com GitHub OAuth e Cloudflare Workers. **Neste PR, a publicação vem desabilitada e o backend não foi implantado.** A edição local, recuperação de rascunhos e exportação funcionam sem configurar contas. Consulte o [passo a passo para Windows/PowerShell](docs/IMPLANTACAO-WINDOWS.md) antes de habilitar o serviço.

## Publicar diretamente pelo editor, depois da configuração

1. Clique em **Entrar com GitHub**. Na janela segura, autorize a GitHub App com a conta `edudiias`. Se o navegador separar a janela durante o login, volte ao editor e clique novamente em **Entrar com GitHub** para reconectar; o rascunho é preservado.
2. Edite e salve os produtos normalmente. Clique em **Publicar alterações**. Um formulário preenchido será validado e salvo antes de abrir a revisão.
3. Confira os dados e o destino na janela segura e clique em **Confirmar publicação**. Apenas `cardapio.json` de `edudiias/ursa-cardapio`, em `main`, pode ser atualizado pela API.
4. Aguarde a mensagem de commit criado. **O GitHub Pages ainda poderá estar atualizando:** confirme o resultado no endereço público habitual antes de considerar a mudança visível aos clientes.
5. Use **Sair** para encerrar a sessão de publicação neste editor. Isso não apaga o rascunho nem encerra a conta GitHub em outros sites. Sessões duram no máximo uma hora; se expirarem, entre novamente.

Uma publicação recusada ou sem resposta mantém o trabalho local. Se a resposta for incerta, consulte o histórico de commits antes de tentar novamente. Se o arquivo remoto tiver mudado, o editor não sobrescreve: use **Revisar versão do GitHub no editor** e escolha entre recuperar o rascunho para revisão ou carregar o remoto. Recuperar não combina automaticamente as versões; revise os dados antes de confirmar outro envio. **Exportar cardapio.json** continua disponível como backup e alternativa manual.

Se o commit for confirmado antes de o Pages atualizar, uma cópia local com a confirmação é mantida. Ao recarregar nesse intervalo, o editor avisa da diferença; recupere o rascunho para manter os dados recém-publicados. Alterações feitas durante o envio continuam pendentes e não são apagadas pela confirmação do snapshot anterior.

## Usar o editor

1. Abra `editor.html` no mesmo site do cardápio, ou no servidor local explicado abaixo.
2. Busque um produto pelo nome e clique em **Editar**. Altere os campos e clique em **Salvar produto**.
3. Para cadastrar, clique em **Novo produto**, preencha nome, categoria e preço e salve. A descrição é opcional. Para um item sem preço, marque **Sem preço definido**; o público verá **Consulte**.
4. Use **Pausar** para esconder um produto do público, mantendo seus dados. Use **Ativar** para exibi-lo novamente. **Excluir** pede confirmação.
5. Em **Categorias**, adicione nomes, renomeie ou use as setas para mudar a ordem. Renomear também atualiza os produtos. Para excluir uma categoria, primeiro mova ou exclua todos os produtos dela, inclusive os pausados.
6. Faça quantas alterações quiser e clique em **Exportar cardapio.json** ao terminar. Um formulário de produto ainda preenchido será validado e salvo antes do download. Adicione ou limpe uma nova categoria ainda não cadastrada antes de exportar.
7. Confira o arquivo baixado na pasta Downloads. Alguns navegadores acrescentam um número ao nome; para publicar, o nome deve ser exatamente `cardapio.json`.

**Seu trabalho é salvo automaticamente neste navegador e dispositivo, usando localStorage.** Produtos, categorias e até formulários em preenchimento são recuperados ao atualizar a página (inclusive com **Ctrl + F5**) ou fechá-la e reabri-la no mesmo endereço. Clique em **Salvar produto** para aplicar os campos à lista; campos incompletos também são guardados como rascunho, mas precisam ser corrigidos antes de exportar.

O indicador **“Alterações salvas neste dispositivo — publicação pendente”** confirma o salvamento local. Ele continua visível depois da exportação: baixar o arquivo não publica nada no GitHub. O aviso separado de alterações não exportadas é limpo quando o download é solicitado; confira se o arquivo realmente chegou à pasta Downloads. O rascunho permanece no navegador após exportar.

**Importar JSON** permite trazer um arquivo de outro dispositivo ou retomar um backup. A importação valida todos os dados e pede confirmação antes de substituir o rascunho local. Depois da confirmação, o arquivo importado também é salvo automaticamente no dispositivo. Arquivos inválidos ou importações canceladas não alteram o trabalho atual. Limite: 5 MB.

## Recuperar ou descartar alterações locais

- Para continuar trabalhando, basta abrir o editor no **mesmo navegador, perfil, dispositivo e endereço**. O rascunho será recuperado sem importar arquivo algum.
- Se houver uma **nova versão do cardapio.json publicado**, o editor preserva o rascunho e pede uma escolha. **Recuperar rascunho** mantém seus produtos, categorias e formulário local; **Carregar versão publicada** pede confirmação e descarta o trabalho local. Não há combinação automática das duas versões: ao recuperar, revise as diferenças antes de exportar. A escolha vale para essa versão publicada; uma nova mudança no site volta a mostrar o aviso.
- Para começar novamente com os dados do site, clique em **Descartar alterações locais** e confirme. Isso apaga somente o rascunho deste editor, incluindo formulários e mudanças já exportadas, e carrega a versão publicada mais recente. Não altera o site nem apaga arquivos já baixados. Se não for possível carregar a versão publicada, o rascunho é mantido.
- Se a versão publicada estiver temporariamente indisponível, mas houver rascunho, o editor recupera o trabalho local e avisa que não conseguiu verificar o site. Se o rascunho estiver corrompido ou for incompatível, ele não é sobrescrito automaticamente; tente reabrir a página ou escolha descartá-lo explicitamente.

Mantenha uma cópia exportada como backup: limpar os dados do navegador, usar outro perfil/endereço ou encerrar uma sessão anônima pode remover ou deixar inacessível o rascunho. Ele não é sincronizado entre dispositivos. Se o navegador bloquear o armazenamento ou atingir o limite de espaço, o editor mostra um aviso de falha e permite exportar; nesse caso, não atualize ou feche antes de baixar um backup. O aviso de saída é uma proteção adicional e pode não aparecer em celulares.

## Alternativa manual de publicação

A edição local pode ser aberta por qualquer visitante. A publicação direta exige autenticação e autorização verificadas no backend; nenhum token GitHub chega ao JavaScript do editor. Se preferir não configurar o backend ou se o serviço estiver indisponível, alguém autorizado no repositório pode publicar manualmente. Não coloque senhas, tokens ou informações confidenciais no editor ou no JSON; os arquivos do site são públicos.

1. Exporte o arquivo e guarde uma cópia do `cardapio.json` atualmente publicado como backup.
2. No GitHub, abra `edudiias/ursa-cardapio` e crie uma **nova branch a partir de `main`**.
3. Nessa branch, use **Add file → Upload files** para substituir somente o arquivo `cardapio.json` na raiz pelo arquivo exportado. Confirme o nome e registre a alteração.
4. Abra um Pull Request para `main`. Confira as diferenças de produtos, preços e categorias e valide a branch conforme a seção seguinte. Peça a revisão de uma pessoa autorizada.
5. Após aprovação, essa pessoa pode mesclar o PR. Aguarde a publicação existente do GitHub Pages e confira o endereço público habitual, inclusive pelo QR Code atual.

Não renomeie `index.html`, não altere a configuração de endereço do GitHub Pages e não gere outro QR Code. O cardápio público não exige backend nem build. O Worker separado atende somente autenticação e publicação. Para desfazer uma atualização de dados, importe e revise um backup antes de publicá-lo, ou publique-o manualmente por branch e PR.

## Validar antes de publicar

Baixe ou faça checkout da branch do PR. Na pasta do projeto, inicie um servidor estático; com Python instalado:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Abra [o cardápio local](http://127.0.0.1:8000/) e [o editor local](http://127.0.0.1:8000/editor.html). Não abra os HTMLs por duplo clique: o carregamento de JSON depende de HTTP/HTTPS.

- Confira os produtos e preços originais no cardápio e teste a busca e os filtros por categoria.
- No editor, altere um preço e clique em **Salvar produto**. Pressione **Ctrl + F5**: o preço deve continuar alterado sem importar arquivo. Feche e reabra a página e confira novamente.
- Cadastre outro produto e altere categorias. Atualize a página antes de exportar e confira se as alterações e o indicador de publicação pendente permanecem. Teste também um formulário ainda incompleto.
- Pause e ative um produto. Cancele uma exclusão para conferir a confirmação; depois confirme a exclusão de um produto de teste.
- Adicione, renomeie e reordene uma categoria. Tente excluir uma categoria ocupada e outra vazia.
- Teste nome vazio, preço negativo e texto no preço. Devem ser rejeitados. Teste também a opção **Consulte**.
- Exporte e recarregue o editor: o rascunho deve continuar presente e a publicação deve continuar pendente. Importe um arquivo válido e recarregue novamente. Tente importar um JSON inválido e confira se os dados anteriores continuam presentes.
- Clique em **Descartar alterações locais** e cancele: o trabalho deve permanecer. Repita e confirme: o editor deve voltar à versão publicada, inclusive após recarregar.
- Para simular uma atualização do site, mantenha um rascunho e altere o JSON somente no servidor da sua cópia local. Recarregue o editor: o aviso deve permitir recuperar o rascunho ou carregar a nova versão publicada, sem sobrescrever os dados antes da escolha.
- Para conferir o público com as alterações, substitua **somente na cópia local da branch** o `cardapio.json` pelo exportado e recarregue o cardápio. Somente ativos devem aparecer e a ordem das categorias deve ser respeitada.
- Repita em uma tela de celular. Antes de mesclar este PR de implementação, descarte os dados de teste e confirme que os 54 produtos originais continuam no JSON entregue.

## Testes automatizados

O site não tem dependências externas em produção. Os testes de dados usam Node.js 22 ou superior e não precisam de instalação:

```sh
node --test tests/*.test.cjs
```

Os testes em navegador usam Playwright somente em desenvolvimento:

```sh
npx --yes pnpm@11.25.0 install --frozen-lockfile
npx pnpm@11.25.0 exec playwright install chromium
npx pnpm@11.25.0 test
npx pnpm@11.25.0 test:browser
```

Opcionalmente use um navegador instalado: `BROWSER_CHANNEL=msedge` ou `BROWSER_CHANNEL=chrome` (no PowerShell: `$env:BROWSER_CHANNEL='msedge'`). A comparação visual usa o `index.html` original do commit `4f7adab`, portanto mantenha esse commit no histórico local; em clones rasos, baixe o histórico antes do teste.

As suítes de navegador servem o projeto em `/ursa-cardapio/`, como no GitHub Pages. Verificam o visual público original, edição, validação, importação/exportação, recuperação e tela móvel. A suíte de publicação usa domínios HTTPS interceptados e **GitHub inteiramente simulado**: nenhum token real, commit remoto ou deploy é feito. Cobre OAuth, cookies, confirmação, sucesso, conflito, falha, expiração de sessão e novas edições durante o envio. Os testes de backend também verificam autorização em cada publicação, CSRF, SHA e destino fixo. Capturas e builds ficam em `test-results/` (fora do Git).

## Arquitetura e segurança da publicação

- **Cloudflare Worker + GitHub App OAuth:** Authorization Code com PKCE S256 e `state` de uso único. A GitHub App deve ser instalada somente neste repositório, com `Contents: read and write`; `Metadata: read` é a permissão obrigatória implícita. Não há escopo OAuth amplo `repo`, PAT ou chave privada de instalação.
- **Sessões:** identificador aleatório em cookie `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`; token OAuth criptografado com AES-GCM no backend, expiração máxima de uma hora, sem refresh automático. Estado OAuth e sessões ficam em Durable Object com armazenamento transacional e limpeza por alarmes. Segredos só em Workers Secrets.
- **Janela segura:** autenticação e requisições autenticadas acontecem no próprio domínio do Worker, como navegação de primeiro nível. A página do GitHub Pages mantém seu localStorage. `postMessage` aceita somente a origem configurada, a janela esperada e o identificador daquela abertura; não transmite token ou cookie ao editor. Isso evita depender de cookies de terceiros entre `github.io` e `workers.dev`.
- **API:** CORS concede somente a origem exata do cardápio, sem wildcard. Requisições de escrita exigem origem autorizada e token CSRF da sessão. A origem do próprio Worker atende a janela por same-origin. Identidade GitHub (`edudiias`, ID `175474516`) é conferida no servidor em cada publicação.
- **Destino fixo:** repositório, arquivo e branch são constantes do servidor; o cliente envia somente menu e SHA. Validação é compartilhada com o cardápio, com limite de 512 KB por requisição, até 100 categorias e 2.000 produtos. A comparação de SHA antes do PUT e o SHA exigido pelo GitHub protegem contra concorrência, sem tentativa de sobrescrever ou forçar alterações.
- **Operação:** `PUBLISH_ENABLED=false` é o padrão. Não há workflow de deploy automático. A GitHub App não deve receber bypass de regras de `main`: se uma regra impedir o commit, a API deve falhar e a exportação permanece disponível.

Fontes oficiais consultadas: [OAuth de GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [PKCE](https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/), [API de Contents e SHA](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents), [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Durable Objects SQLite](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) e [assets do Worker](https://developers.cloudflare.com/workers/static-assets/binding/).

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
