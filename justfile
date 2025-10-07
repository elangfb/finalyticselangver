# Serve development server
dev:
    corepack pnpm run dev

alias depl := deploy-to-development

# Deploy web by push to mirror repo
deploy-to-development:
    git pull --ff-only
    ./scripts/app-meta.sh set Development-Last-Commit-Id "$(git log -1 --pretty=format:"%H" -- :!.app-meta)"
    git add .app-meta
    git commit -m 'chore: update app meta'
    git push
    git push --force github.com:luthfisolahudin/arunami-finalytics-web-dev.git main-update:main

alias deplp := deploy-to-production

# Deploy web by push to mirror repo
deploy-to-production:
    git pull --ff-only
    ./scripts/app-meta.sh set Production-Last-Commit-Id "$(git log -1 --pretty=format:"%H" -- :!.app-meta)"
    git add .app-meta
    git commit -m 'chore: update app meta'
    git push
    git push --force github.com:luthfisolahudin/arunami-finalytics-web.git main-update:main
