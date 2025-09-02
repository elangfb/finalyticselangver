# Serve development server
dev:
    corepack pnpm run dev

# Push web subplit to mirror bot repo
sync-web-split:
    git subtree split --prefix "web" --branch subsplit-web
    git push --force noeffort-bot.github.com:noeffort-bot/arunami-finalytics-web-next.git subsplit-web:main
    git branch -D subsplit-web
