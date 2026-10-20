# Project Charter - MagicPlan MCP

> **Note:** This document is **fictional**. FantasyTrips S.r.l., the people named below, and the client scenario are **invented** for a learning/portfolio exercise. There is **no** affiliation with The Walt Disney Company or Disneyland Paris. See the [README](../README.md#about-this-project).

---

## Client

| Field         | Value                         |
| ------------- | ----------------------------- |
| Company       | FantasyTrips S.r.l.           |
| Sector        | Tour operator / family travel |
| Main contact  | Colette Bonheur               |
| Contact email | c.bonheur@fantasytrips.it     |
| Contact phone | +39 02 4521 8800              |
| Headquarters  | Borgostella, Italy            |

---

## Project objective

FantasyTrips is a boutique tour operator specializing in family packages to European Disney parks. A team of eight customer-service agents handles daily messages and calls from families who are **already inside the park** and need real-time guidance: which attractions to visit based on their children’s favorite characters, how long the wait is, and what to do when a queue is too long.

Today, each agent answers from memory or by manually opening the park website, fan wikis, and third-party apps. The result is slow (two to four minutes per reply), inconsistent across agents, and often inaccurate on actual wait times.

FantasyTrips has already adopted an internal AI assistant based on Claude for communications. **The (fictional) client wants to extend this assistant** so it can answer in-park orientation questions on its own, combining Disney lore with live attraction data.

---

## Stakeholders

| Role              | Name               | Responsibility                                         | Contact                    |
| ----------------- | ------------------ | ------------------------------------------------------ | -------------------------- |
| Decision maker    | Phoebus Laurent    | CEO; budget approval and go-live                       | p.laurent@fantasytrips.it  |
| Project sponsor   | Colette Bonheur    | Head of Customer Experience; client-side project owner | c.bonheur@fantasytrips.it  |
| Key users         | CS team (8 agents) | Daily use via internal AI assistant                    | -                          |
| Technical contact | Lumière Beaumont   | IT manager; infrastructure and access                  | l.beaumont@fantasytrips.it |

---

## Scope

### In scope

- Extend the existing AI assistant with access to external real-time data, without changing the current system
- The assistant can look up a Disney character by name and return films, TV shows, and park attractions where they appear
- The assistant can return, for a given character, only the park attractions where that character is featured
- The assistant can query live wait times for all attractions in the main park and the secondary park
- The assistant can query current weather conditions near the park
- The assistant can plan a tailored visit: given the family’s favorite characters and a maximum acceptable wait time, it suggests attractions available at that moment; if requested, when it rains it automatically prioritizes indoor attractions

### Out of scope

- Ticket booking and park access management
- Hotel, shopping, and dining information
- Authentication and user management
- Dedicated frontend or graphical interface
- Historical queue data (real-time data only)
- Non-Disney parks
- Push notifications for sudden attraction closures
- Multilingual support (English only in this phase)
