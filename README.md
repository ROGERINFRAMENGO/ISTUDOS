# Estudo Etec

Protótipo de plataforma de estudos inspirada em apps de aprendizado, adaptada para a preparação para o Vestibulinho Etec.

## O que está incluso

- dashboard com sequência, XP e metas
- trilhas por disciplina
- questão do dia e respostas com feedback
- simulado com resultado e recompensas
- caderno de erros e revisões
- fluxo visual pensado para manter consistência, não competição

## Publicar no GitHub Pages

Este projeto é estático e já pode ser publicado diretamente no GitHub Pages.

### Opção 1: publicação simples

1. envie o projeto para um repositório no GitHub
2. abra o repositório em GitHub
3. vá em Settings → Pages
4. em "Build and deployment", selecione "GitHub Actions"
5. confirme

O fluxo em [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml) faz o deploy automaticamente.

### Opção 2: testar localmente

```bash
python -m http.server 8000
```

Depois abra:

```text
http://localhost:8000/
```

## Arquivos principais

- [index.html](index.html)
- [styles.css](styles.css)
- [app.js](app.js)

> O site usa caminhos relativos, então ele funciona bem em páginas hospedadas no GitHub Pages sem precisar de build ou bundler.
