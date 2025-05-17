compile:
	npx tsc -p .
	
packages:
	npm install

build:
	npx vsce package

download-node:
	curl -o- https://fnm.vercel.app/install | bash
	$$HOME/.local/share/fnm/fnm install 22
	@printf "\n\033[31mRelog or exec (depending on shell):\nsource ~/.zshrc\nsource~/.bashrc\033[0m"