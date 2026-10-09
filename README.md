# Nodal AI

**An agentic SEO content generation platform designed to automate content workflows from keyword research to publication.**

Nodal AI is an AI-powered platform built to streamline SEO content production through specialized agents, data-driven research, and automated workflows.

Rather than relying on a single prompt to generate articles, Nodal AI orchestrates multiple steps, combining keyword research, search data analysis, AI-powered writing, and image generation to produce structured content aligned with search intent.

## Overview

Creating high-quality SEO content requires more than generating text. It involves understanding search intent, analyzing relevant keywords, structuring articles, and producing content that meets both user expectations and search engine requirements.

Nodal AI brings these steps together into an agentic workflow, reducing manual work while maintaining control over the content creation process.

## Key Features

* **Keyword Research** — Identify relevant keywords and search opportunities using DataForSEO.
* **SEO Research** — Use search data to inform content structure, topical coverage, and search intent.
* **Agentic Content Generation** — Orchestrate multi-step AI workflows to transform research into structured articles.
* **AI-Powered Writing** — Generate long-form content using Anthropic's Claude models.
* **AI Image Generation** — Generate visual assets using Google's Gemini models.
* **Structured Content Workflows** — Separate research, analysis, writing, and visual generation into distinct stages.
* **Automated Content Production** — Streamline repetitive SEO content tasks through coordinated AI agents.
* **Scalable Infrastructure** — Run backend services on a dedicated server using PM2 and Nginx.

## Tech Stack

### Frontend

| Technology   | Purpose                    |
| ------------ | -------------------------- |
| Next.js 14   | React framework            |
| TypeScript   | Type safety                |
| Tailwind CSS | Styling and UI development |

### Backend

| Technology | Purpose                              |
| ---------- | ------------------------------------ |
| Express.js | REST API                             |
| Supabase   | PostgreSQL database and file storage |
| PM2        | Process management                   |
| Nginx      | Reverse proxy                        |

### AI & SEO

| Technology         | Purpose                                 |
| ------------------ | --------------------------------------- |
| Claude (Anthropic) | AI-powered content writing and analysis |
| Gemini (Google)    | AI image generation                     |
| DataForSEO         | Keyword research and SEO data           |

## How It Works

Nodal AI structures SEO content creation into a sequence of specialized steps.

1. **Research** — Collect keyword data and SEO insights using DataForSEO.
2. **Analyze** — Process research findings to identify search intent, relevant topics, and article structure.
3. **Generate** — Use Claude to create structured, context-aware SEO content.
4. **Enrich** — Generate relevant visual assets using Gemini.
5. **Prepare for Publication** — Organize the generated content for review and integration into publishing workflows.

Each stage contributes to the final output, creating a more structured and controllable process than single-step AI text generation.

## Architecture

Nodal AI uses a Next.js frontend connected to an Express.js REST API. Supabase provides PostgreSQL persistence and storage, while the backend runs behind Nginx and is managed with PM2.

External AI and SEO services are integrated into the content pipeline, allowing the platform to combine search data, language models, and image generation within a unified workflow.

## Technical Highlights

* Multi-step AI orchestration for SEO content production.
* Integration of multiple AI providers for specialized tasks.
* Data-driven content generation based on keyword research.
* Separation of frontend, backend, data storage, and AI services.
* Self-hosted backend infrastructure using Nginx and PM2.
* Modular workflows designed to make content generation more structured and repeatable.

## Project Vision

Nodal AI aims to move beyond generic AI writing tools by treating SEO content creation as an orchestrated process rather than a single generation request.

By combining SEO data, specialized AI models, and modular workflows, the platform aims to make content production more systematic, scalable, and aligned with search intent.

## Project Status

Nodal AI is a proprietary project. The source code and internal implementation are not publicly available.

---

**Built with Next.js, TypeScript, Express.js, Supabase, Claude, Gemini, and DataForSEO.**
