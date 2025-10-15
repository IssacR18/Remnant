# Remnant Experience Site Plan

## Vision Overview
Remnant offers an immersive portal for preserving and reliving spatial "memories" captured with the PortalCam device. The web experience must feel like a futuristic archive, blending storytelling, utility, and surprise animations to reinforce the idea of stepping back into captured moments.

### Core Goals
- **Convey trust and wonder**: reassure visitors about the preservation service while exciting them about reliving memories.
- **Explain the service journey**: from scheduling a PortalCam session to accessing the preserved `.lcc` memory.
- **Deliver an interactive account area**: logged-in users should browse, preview metadata, and launch the dedicated LCC viewer (out of scope for now).

## High-Level Information Architecture
1. **Landing / Marketing Portal**
   - Hero animation introducing Remnant and PortalCam.
   - Scroll-triggered sections narrating the capture-to-view pipeline.
   - Call-to-action flows: "Schedule a Scan" and "Enter Archive" (login).
2. **Onboarding & Scheduling Flow**
   - Step-by-step modal or multi-panel wizard.
   - Integrations for booking, FAQs, and equipment requirements.
3. **Account Login & Authentication**
   - Animated gate/portal effect during authentication.
   - Options for email/password and third-party auth.
4. **User Dashboard (Archive Overview)**
   - Memory library with filtering, tagging, and emotional tone indicators.
   - Notifications for processing status of recent scans.
   - Quick links to launch the LCC viewer (not implemented yet).
5. **Memory Detail View (Metadata Panel)**
   - Display session info, capture location, collaborators, notes, and sensory annotations.
   - Timeline of updates, processing stages, or remastering requests.
6. **Settings & Profile Management**
   - Personal info, PortalCam appointments, security options.
   - Subscription tiers and storage usage visualizations.
7. **Support & Knowledge Base**
   - Interactive FAQ with collapsible cards.
   - Contact options, device prep guides, and troubleshooting.
8. **Admin / Technician Console (future)**
   - Monitoring capture queue, verifying data integrity, and approving processed memories.

## Page & Component Breakdown
### Landing Portal
- **Animated Hero Canvas**: Three.js scene with swirling memory fragments reacting to cursor and scroll.
- **Service Pipeline Timeline**: Horizontal carousel showing Capture → Processing → Archive Access.
- **Testimonials & Case Studies**: Looping video cubes and quote cards.
- **Call-to-Action Footer**: Buttons to schedule a scan or sign in.

### Scheduling Wizard
- **Intro Screen**: Outline what happens during a PortalCam session.
- **Availability Selector**: Calendar picker with timezone awareness.
- **Preparation Checklist**: Interactive list with progress animations.
- **Confirmation Screen**: Generates appointment summary and sends reminders.

### Authentication & Access
- **Portal Gate Animation**: Three.js portal opens on successful login.
- **Multi-factor Verification**: Optional modal for security.
- **Account Recovery Flow**: Stepper with helpful tooltips.

### Dashboard Components
- **Memory Grid/List Toggle**: Reactively morphing layout depending on user preference.
- **Filter & Tag Bar**: Chips for mood, location, people, capture date.
- **Processing Status Cards**: Animated progress states (queued, rendering, ready).
- **Recent Activity Feed**: Timeline of captures, comments, or shared views.

### Memory Detail Panels
- **Hero Snapshot**: 2D capture or short looping fragment preview.
- **Metadata Tabs**: Session, Participants, Sensory Notes, Attachments.
- **PortalCam Diagnostics**: Capture quality metrics.
- **Share & Collaboration**: Manage access permissions.

### Settings Hub
- **Profile Summary Card**: Avatar, contact info, trust badges.
- **Security Controls**: Password, MFA, device management.
- **Subscription & Billing**: Usage charts, plan comparison, payment history.

### Support Center
- **Searchable FAQ**: Highlight matching topics with animated highlights.
- **Guides & Tutorials**: Step-by-step cards with embedded microinteractions.
- **Contact & Live Help**: Chat entry point and escalation pathways.

## Technical Considerations
- **Framework Stack**: React/Next.js for structure, Three.js for hero and portal sequences, GSAP or similar for scroll animations.
- **State Management**: Authentication context + data fetching via REST/GraphQL.
- **Performance**: Lazy-load heavy visuals, fallback experience for low-power devices.
- **Accessibility**: Provide non-3D alternatives, motion-reduction modes, keyboard-first navigation.
- **Internationalization**: Prepare for localization of marketing and UI copy.

## Content & Storytelling Hooks
- **Brand Voice**: Poetic, archival, respectful of memory.
- **Terminology**: "PortalCam", "Memory Capsule", "Archive Gate", "Remastering".
- **Visual Motifs**: Light ribbons, holographic UI, archival stamps.

## Next Steps
1. Prototype landing hero and navigation shell.
2. Flesh out React route structure for landing, scheduling, dashboard, and support pages.
3. Design data models for memories, appointments, and user settings.
4. Draft copy for marketing and onboarding flows.
5. Plan integration touchpoints for LCC viewer (future).

### Step 1 Prototype: Landing Hero & Navigation Shell

The repository now includes an interactive landing prototype (`index.html`) featuring the navigation shell, hero experience, and supporting sections. Open the file in a modern browser to explore the experience. The hero Three.js canvas degrades gracefully to a textual fallback when WebGL is unavailable or when visitors prefer reduced motion.

**Implementation Highlights**

- **Navigation shell** with animated mobile menu, branded lockup, and CTAs for scheduling a scan or entering the archive.
- **Three.js hero portal** rendering orbiting memory shards, parallax reactions, and scroll awareness implemented in `scripts/heroScene.js`.
- **Accessible fallbacks** leveraging `prefers-reduced-motion` detection and WebGL capability checks to reveal a static description when required.
- **Story, CTA, testimonials, and footer sections** that mirror the blueprint's narrative flow and provide anchors for future expansion.

To iterate locally, open `index.html` in a browser or serve the directory via a simple static server (`python3 -m http.server`).

### Step 1 Blueprint: Landing Hero & Navigation Shell Prototype

**Objectives**
- Establish the initial page chrome (header, navigation, footer) with visual language cues from the brand motifs.
- Build a compelling Three.js hero canvas that reacts to scroll and pointer movement while remaining performant.
- Ensure the shell scales to additional pages (dashboard, support) without rework.

**Key Deliverables**
1. **Layout wireframe** illustrating hero, narrative blocks, and CTA placements for desktop and mobile breakpoints.
2. **Component inventory** for the shell: `NavBar`, `PortalToggle`, `CTAButtons`, and `Footer`. Each with interaction notes.
3. **Three.js scene prototype** featuring memory fragments (particles or geometry strips) orbiting a central portal, with parameterized animation speed and color palette.
4. **Interaction storyboard** describing how elements respond to scroll (parallax, text reveals) and hover (portal intensifies, CTA glow).

**Implementation Notes**
- Use Next.js app router structure with a shared `layout.tsx` for global navigation; hydrate hero interactions client-side via dynamic import to avoid SSR issues.
- Lean on GSAP or Framer Motion for scroll-triggered text reveals; synchronize with Three.js timeline via custom hooks.
- Define a `useReducedMotion` hook to supply accessible fallbacks (static hero image, simplified navigation animations).
- Draft a responsive CSS grid or clamp-based layout system to keep hero copy legible across viewports.

**Acceptance Checklist**
- [ ] Navigation includes branded logo lockup, primary CTAs (Schedule Scan, Enter Archive), and collapsible mobile menu.
- [ ] Hero canvas loads within 2 seconds on target devices, with graceful fallback when WebGL is unavailable.
- [ ] Scroll interaction smoothly transitions from hero to story sections without layout shift.
- [ ] Footer anchors (Support, Privacy, Contact) align with overall information architecture.

Completing this blueprint will provide the scaffolding required for subsequent steps, ensuring visual consistency and reducing future rework when deeper functionality is introduced.

