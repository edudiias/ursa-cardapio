# Configuração manual da publicação 1.1 — Windows/PowerShell

Este procedimento é para o responsável pelas contas **GitHub `edudiias`** e **Cloudflare**. O código foi preparado sem criar aplicativos, segredos ou Workers reais. Nenhum comando de implantação foi executado pelo desenvolvimento; apenas compilação `--dry-run` e testes locais/simulados.

Não altere o endereço do GitHub Pages, `index.html` ou o QR Code. O Worker terá outro endereço somente para autenticação e confirmação administrativa. Os clientes continuam usando o cardápio habitual.

## 1. Preparar ferramentas e revisar a branch

Instale Node.js 24 LTS ou superior com npm pelo [site oficial](https://nodejs.org/). Abra o PowerShell na pasta do projeto e verifique:

```powershell
node --version
npm --version
git branch --show-current
npx --yes pnpm@11.25.0 install --frozen-lockfile
npx pnpm@11.25.0 test
```

A branch deve ser `codex/publicacao-automatica-v1`. Ela parte da implementação do editor e da persistência do PR #1. Se esse PR ainda não tiver sido mesclado, este novo PR também mostrará essas alterações. Coordene a revisão dos dois PRs antes de publicar. O arquivo `cardapio.json` precisa existir em `main` após a aprovação; o serviço não cria outros arquivos nem extrai produtos do HTML em produção.

Para testar no Edge instalado, sem baixar um navegador:

```powershell
$env:BROWSER_CHANNEL = 'msedge'
npx pnpm@11.25.0 test:browser
```

Os testes simulam GitHub, OAuth e commits. Eles não precisam de contas ou segredos reais. Para conferir somente o build do Worker, sem deploy:

```powershell
$env:WRANGLER_SEND_METRICS = 'false'
npx pnpm@11.25.0 worker:check
npx pnpm@11.25.0 test:runtime
```

O segundo comando executa o build no runtime local `workerd`, com Durable Object SQLite e rede externa bloqueada. Não implanta recursos.

## 2. Escolher o endereço administrativo do Worker

No painel Cloudflare, escolha a subconta/subdomínio de Workers. O exemplo do projeto usa o nome `ursa-cardapio-publicacao`. O endereço será semelhante a:

```text
https://ursa-cardapio-publicacao.SUA-SUBCONTA.workers.dev
```

Você também pode configurar um domínio próprio exclusivo para o backend, depois de revisar a documentação de [domínios do Worker](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/). Isso é opcional e não exige mudar o domínio do cardápio.

Em `backend/wrangler.jsonc`, preencha somente os valores públicos:

- `BACKEND_ORIGIN`: origem HTTPS real do Worker, sem barra final, caminho, query ou fragmento.
- `EDITOR_ORIGIN`: origem HTTPS exata do endereço atual do cardápio, sem caminho. Para GitHub Pages padrão deste repositório, é `https://edudiias.github.io`. Se já houver domínio próprio, use a origem real existente.
- `GITHUB_CLIENT_ID`: será obtido no próximo passo; não é segredo.
- Mantenha `PUBLISH_ENABLED` como a **string** `"false"` durante toda a configuração e revisão.

Não coloque Client Secret ou chave de criptografia nesse arquivo. Não mude repositório, arquivo, branch ou usuário autorizado no código para realizar testes em produção.

## 3. Criar uma GitHub App com OAuth e permissões mínimas

Autenticado como `edudiias`, abra **Settings → Developer settings → GitHub Apps → New GitHub App**. Use a [documentação oficial de criação](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app) e configure:

1. Nome único, por exemplo `Ursa Cardápio Publicação`.
2. Homepage URL: endereço público atual do cardápio.
3. Callback URL: `https://SEU-WORKER/auth/callback`, usando exatamente a origem escolhida. Não use wildcard.
4. Mantenha expiração dos user access tokens habilitada. Não habilite Device Flow. O login será iniciado pelo editor; não é necessário solicitar autorização durante a instalação.
5. Desabilite o webhook se ele não for usado. Este projeto não exige endpoint público de webhooks.
6. Em **Repository permissions**, conceda somente **Contents: Read and write**. **Metadata: Read-only** é implícita. Não conceda Workflows, Administration, emails ou permissões de organização.
7. Em quem pode instalar, escolha **Only on this account**.
8. Após criar, anote o **Client ID** e gere um **Client Secret**. O App ID não substitui o Client ID. Não é necessário gerar chave privada de instalação.
9. Em **Install App**, instale na conta `edudiias` e selecione **Only select repositories → ursa-cardapio**. Não autorize todos os repositórios.

Foi escolhida uma **GitHub App usando OAuth**, em vez de uma OAuth App clássica: isso permite limitar a instalação a este repositório, sem pedir o escopo amplo `public_repo`/`repo`. Os tokens representam o usuário e respeitam simultaneamente as permissões dele e da App. Veja [OAuth para GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app).

## 4. Preparar o Worker, ainda sem permitir publicação

**Pare aqui se ainda não houver aprovação para implantar o backend.** Os comandos abaixo são manuais e criam recursos na sua conta. Eles não fazem parte da execução automática dos testes.

Com `PUBLISH_ENABLED="false"`, confirme a conta Cloudflare e implante o backend:

```powershell
npx pnpm@11.25.0 exec wrangler login
npx pnpm@11.25.0 exec wrangler whoami
npx pnpm@11.25.0 exec wrangler deploy --config backend/wrangler.jsonc
```

A migração `v1` cria o Durable Object `AuthStore`, com SQLite, usado para estados OAuth e sessões. Não é necessário criar namespace KV, banco D1 ou chave de instalação GitHub. Confirme no painel os limites e cobranças da sua conta antes de habilitar o serviço.

Adicione os segredos por entrada interativa do Wrangler, sem colocá-los no repositório:

```powershell
npx pnpm@11.25.0 exec wrangler secret put GITHUB_CLIENT_SECRET --config backend/wrangler.jsonc
```

Cole o Client Secret somente quando solicitado. Gere uma chave aleatória de 32 bytes e envie diretamente para Workers Secrets:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))" | npx pnpm@11.25.0 exec wrangler secret put SESSION_ENCRYPTION_KEY --config backend/wrangler.jsonc
```

Nunca use a chave ou os valores de teste da suíte. A chave deve permanecer estável entre deploys para manter sessões existentes; trocá-la invalida sessões e exigirá novo login. Não envie os segredos por chat, commit, screenshot, query string ou arquivo público.

`backend/.dev.vars.example` mostra apenas os nomes de segredos. Para desenvolvimento privado com credenciais próprias, copie-o para `backend/.dev.vars` e preencha localmente; esse arquivo e variantes reais estão no `.gitignore`. Não o copie para a pasta `backend/public` nem para assets do site. O fluxo real exige HTTPS e callback registrado exatamente; para validar o código sem contas, prefira a suíte simulada.

## 5. Configurar o frontend e validar o login

Em `editor-config.js`, preencha apenas a origem pública do Worker:

```javascript
window.UrsaPublishConfig = { backendOrigin: 'https://SEU-WORKER' };
```

Essa URL e as variáveis públicas do Wrangler podem ser revisadas e versionadas na branch. Nenhum segredo deve ser acrescentado. Não mescle automaticamente nem altere a URL dos clientes para testar.

Antes da publicação do frontend aprovado, você pode abrir `https://SEU-WORKER/publish` e testar **Entrar com GitHub**. A sessão deve mostrar `edudiias`; a publicação deve continuar bloqueada pela configuração. Para o fluxo completo editor → janela, use a versão 1.1 após sua publicação aprovada no endereço habitual. Se um provedor ou navegador separar a janela do editor durante o OAuth, retorne ao editor e clique novamente em **Entrar com GitHub**; a sessão do Worker será reutilizada e o rascunho não será perdido.

O cookie fica no próprio domínio do Worker, com `HttpOnly`, `Secure`, `SameSite=Lax`. O editor não lê esse cookie nem recebe o token GitHub. Não mude para token em localStorage ou cookie não seguro para contornar bloqueios do navegador. Permita pop-ups para o cardápio ou use a exportação manual.

## 6. Habilitar publicação somente após revisão e aprovação

**Esta etapa autoriza commits reais em `main` e afeta o cardápio dos clientes. Não execute como teste.**

1. Revise os testes e os PRs; faça a mesclagem somente pelo processo aprovado da equipe. Confirme que os 54 produtos originais e a configuração de GitHub Pages continuam corretos.
2. Confirme que a App está instalada apenas em `edudiias/ursa-cardapio`, com Contents read/write. Não dê bypass às regras da branch `main`. Se elas exigirem PR para todo commit, a publicação direta será recusada e a exportação manual continuará funcionando; não enfraqueça essas regras automaticamente.
3. Quando o responsável decidir habilitar a função, altere `PUBLISH_ENABLED` para a string `"true"` na configuração revisada e faça manualmente um novo deploy do Worker.
4. Entre pelo editor, revise um cardápio destinado a publicação real, clique **Publicar alterações** e confirme na janela segura. O serviço lê o SHA atual, verifica novamente a identidade no GitHub e tenta atualizar somente `cardapio.json` em `main`.
5. Confira o link do commit e aguarde a atualização do GitHub Pages. Um commit confirmado não significa que a CDN do Pages já terminou a atualização. O endereço e o QR Code continuam os mesmos.

Para desligar novas publicações, volte a `PUBLISH_ENABLED="false"` e faça deploy manual. Para revogar o acesso da App, use as configurações GitHub de instalações/autorização. **Sair** no editor remove imediatamente a sessão do backend; não remove rascunhos locais nem revoga toda a App.

## Falhas e conflitos

- **Conflito:** o SHA ou os dados remotos mudaram. Não existe botão de forçar sobrescrita. Revise a versão do GitHub, recupere ou descarte seu rascunho explicitamente e confira tudo antes de nova confirmação.
- **Sessão expirada/revogada:** entre novamente; os dados locais permanecem.
- **Permissão/regra de branch:** confira a instalação da App e as regras de `main`. Não conceda acesso amplo como atalho.
- **Resposta incerta/timeout:** consulte o histórico do arquivo antes de tentar outra vez. A próxima tentativa compara a versão remota e evita um commit duplicado se o conteúdo já for igual.
- **Worker indisponível, pop-up bloqueado ou contas ainda não configuradas:** exporte o JSON e use o procedimento manual do README.
- **Commit criado, mas site antigo:** aguarde o Pages. O editor mantém uma cópia local com a confirmação até o site alcançar a versão publicada.

Referências: [Contents API](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents), [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [Durable Objects SQLite](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).
