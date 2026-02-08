# NFL Coaching Tree

Interactive visualization mapping the mentorship lineage of every current NFL head coach. Built with Next.js, React, TypeScript, and D3.js.

**[View Live Site](https://nyurkov.github.io/NFLCoachingTree/)**

## Features

- Layered DAG visualization of coaching mentorship chains
- Search with typeahead to find any coach and highlight their full tree
- Click-path tracking to explore mentor connections
- Hover to highlight deepest ancestor lineage
- Responsive design with mobile bottom-sheet sidebar
- 339 coaches and 586 documented connections

## Tech Stack

- **Next.js** (static export for GitHub Pages)
- **React 19** + **TypeScript**
- **D3.js v7** for SVG graph rendering
- **Tailwind CSS** for styling
- **Framer Motion** for mobile animations
- **Vitest** for unit testing

## Getting Started

```bash
cd web
npm install
npm run dev     # http://localhost:3000
npm test        # run unit tests
npm run build   # static export to out/
```

## Data

Coaching connection data is sourced from Wikipedia via custom Python scrapers in `/scraper`.
