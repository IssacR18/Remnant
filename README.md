# 🪞 Remnant — The Spatial Memory Experience

> *Preserve what was. Relive what mattered. Step through the portal.*

Remnant is a digital preservation platform built around the **PortalCam** — a LiDAR-based capture device that turns physical spaces into living, explorable “memories.”
Visitors can schedule scans, preserve moments, and later revisit their environments through a secure, immersive archive.

## 🌌 The Vision

Remnant exists at the intersection of **memory, technology, and emotion**.
It redefines how we remember by converting real places into enduring digital experiences — allowing users to *step back into their moments* long after they’ve passed.

Every captured scene is processed into a **Memory Capsule**, visualized through advanced 3D rendering and stored privately in a secure online archive.

## 🧭 The Experience

| Area                       | Description                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Landing Portal**         | A cinematic, interactive homepage introducing Remnant and the PortalCam — complete with motion-reactive visuals and smooth storytelling flow. |
| **Scheduling Flow**        | A guided process for clients to book their scan, prepare their environment, and receive session confirmations.                                |
| **User Archive Dashboard** | Personalized memory library showing recent captures, processing progress, and emotional tagging.                                              |
| **Support Center**         | An interactive FAQ and contact area for device prep, troubleshooting, and scan management.                                                    |

## 🔐 Infrastructure

Remnant is hosted on **Vercel**, ensuring lightning-fast performance and reliability for users accessing their archives across devices.

User authentication and data storage are managed through **Supabase**, which securely handles:

* Account creation and login credentials
* User session tokens and permissions
* Memory metadata and scheduling records

All account and memory data are encrypted and tied directly to user profiles, ensuring privacy and long-term reliability.

## 🧠 Core Features

* 🌀 **Immersive Hero Portal** — Real-time 3D environment built for motion and depth.
* 📸 **End-to-End Capture Flow** — Schedule, process, and revisit your PortalCam sessions.
* 🔐 **Secure Access** — Supabase-powered login and authentication for private archives.
* 🪄 **Living Memories** — Memories evolve through remastering and visual refinements over time.
* 🌙 **Responsive & Accessible** — Designed for all screens and all users, with motion-reduction fallbacks.

## 🧬 Technology Overview

Remnant combines **modern web architecture** with creative 3D design to form an interactive archive:

| Layer                          | Tools & Services                                          |
| ------------------------------ | --------------------------------------------------------- |
| **Hosting & Deployment**       | [Vercel](https://vercel.com)                              |
| **Authentication & Database**  | [Supabase](https://supabase.com)                          |
| **Frontend Framework**         | HTML, CSS, and JavaScript (expanding to React components) |
| **3D Engine**                  | Three.js for portal animations and particle simulations   |
| **Animation Layer**            | GSAP / Framer Motion for scroll and hover effects         |
| **Backend Services (Planned)** | Supabase Functions and REST endpoints for user memories   |

The site architecture is modular and ready to expand — the same infrastructure will eventually power the dedicated `.lcc` memory viewer.

## 🎨 Brand Language

Remnant’s identity is grounded in **reverence, calm, and curiosity**.
The interface and copy evoke a sense of stepping into a digital museum — futuristic yet deeply human.

**Motifs:**
Light ribbons • Holographic UI • Archival seals • Soft gradients of memory blue

**Terminology:**
PortalCam · Memory Capsule · Archive Gate · Remastering

## 🔮 Roadmap

| Phase       | Focus                                              | Status        |
| ----------- | -------------------------------------------------- |---------------|
| **Phase 1** | Landing portal + hero experience                   | 🚧 In progress|
| **Phase 2** | Scheduling & login integration (Vercel + Supabase) | 🚧 In progress|
| **Phase 3** | Archive dashboard and memory library               | ⏳ Planned    |
| **Phase 4** | LCC viewer integration for 3D playback             | 🔜 Upcoming   |

## 🏛️ The Purpose

Remnant is not just a service — it’s an archive for the human experience.
It bridges **technology and memory**, ensuring that spaces and moments can outlive their physical forms.

> “Every place holds a story. We build the portals that let you step back inside.”
