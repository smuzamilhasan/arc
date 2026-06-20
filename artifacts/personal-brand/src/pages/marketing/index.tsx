import { useEffect, useMemo, useRef, useState } from "react";
import "./marketing.css";

// Public "Get early access" intake - posts { email } to our own API (stored in
// the Postgres `waitlist` table). Same-origin, so a relative path is enough.
const WAITLIST_ENDPOINT = "/api/waitlist";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function BrandMark() {
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <path d="M24 84 A50 50 0 0 1 92 52" stroke="#ECEAE2" strokeWidth={9} strokeLinecap="round" />
      <circle cx="92" cy="52" r="8" fill="#2BE0A0" />
    </svg>
  );
}

function AssistantAvatar() {
  return (
    <span className="ava">
      <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <path d="M30 80 A44 44 0 0 1 88 50" stroke="#6BF0C4" strokeWidth={9} strokeLinecap="round" />
        <circle cx="88" cy="50" r="8" fill="#2BE0A0" />
      </svg>
    </span>
  );
}

function WaitForm({
  submitted,
  onSubmitted,
  note,
}: {
  submitted: boolean;
  onSubmitted: () => void;
  note: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const el = inputRef.current;
    const email = (el?.value ?? "").trim();
    if (!EMAIL_RE.test(email)) {
      if (el) {
        el.focus();
        el.style.color = "#F0506A";
        setTimeout(() => {
          if (el) el.style.color = "";
        }, 1200);
      }
      return;
    }
    try {
      await fetch(WAITLIST_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "landing" }),
      });
    } catch {
      // Still confirm to the user; the capture can be retried server-side.
    }
    onSubmitted();
  };

  return (
    <div className={submitted ? "wait-block done" : "wait-block"}>
      <form className="wait-form" onSubmit={handleSubmit} noValidate>
        <input
          ref={inputRef}
          type="email"
          name="email"
          placeholder="you@work.com"
          aria-label="Email address"
          required
        />
        <button type="submit" className="btn btn-primary">
          Get early access
        </button>
      </form>
      <p className="form-note">{note}</p>
      <div className="form-success">
        <span aria-hidden="true">✓</span> You're on the list. We'll be in touch
        before launch.
      </div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={open ? "faq-item open" : "faq-item"}>
      <button className="faq-q" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {q} <span className="ic" aria-hidden="true">+</span>
      </button>
      <div className="faq-a" style={{ maxHeight: open ? 500 : 0 }}>
        <p>{a}</p>
      </div>
    </div>
  );
}

const FAQS = [
  {
    q: "Will it sound like me, or like AI?",
    a: "Like you. BuildMyArc trains on your voice and positioning before it drafts anything - and you approve everything before it ships. The whole point is taste, not slop.",
  },
  {
    q: "Do I need to be technical?",
    a: "No. Removing the tooling friction is the entire mission. Today it's a guided set of pages; soon it's a single chat in the apps you already use. If you can text, you can run it.",
  },
  {
    q: "What do I get in early access?",
    a: "The engine: the profiling interview, your operating profile, a content calendar wired to your channels, and field insights on what to do next. Founding pricing locks while you're in.",
  },
  {
    q: "When does the WhatsApp assistant arrive?",
    a: "It's the roadmap the engine is built toward. Founding members get it first, and help shape how it works.",
  },
  {
    q: "How does this relate to arc. and Muzamil Hasan?",
    a: "BuildMyArc is the SaaS layer of arc., Muzamil Hasan's brand. Same method, same belief - narrative is the moat - now productized so you can run it yourself.",
  },
];

export default function MarketingLanding() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Decorative "noise" bars behind the signal - stable across renders.
  const bars = useMemo(
    () => Array.from({ length: 80 }, () => 8 + Math.random() * 120),
    [],
  );

  // Nav background on scroll.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Reveal-on-scroll for every .reveal inside the landing.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = root.querySelectorAll<HTMLElement>(".reveal");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -40px 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const onSubmitted = () => setSubmitted(true);

  return (
    <div className="mkt" ref={rootRef}>
      {/* ============ NAV ============ */}
      <header className={scrolled ? "nav scrolled" : "nav"}>
        <div className="nav-in">
          <a className="brand" href="#top" aria-label="BuildMyArc home">
            <BrandMark />
            <span>
              Build<b>My</b>Arc<span className="dot">.</span>
            </span>
          </a>
          <div className="nav-links-wrap">
            <nav className="nav-links" aria-label="Primary">
              <a href="#how">How it works</a>
              <a href="#features">Features</a>
              <a href="#why">Why</a>
              <a href="#faq">FAQ</a>
            </nav>
            <div className="nav-cta">
              <a href="#waitlist" className="btn btn-primary">
                Get early access
              </a>
            </div>
          </div>
        </div>
      </header>

      <main id="top">
        {/* ============ HERO ============ */}
        <section className="hero" id="hero">
          <div className="hero-aura" aria-hidden="true" />
          <div className="wrap hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">An arc. product - early access</span>
              <h1>
                Your expertise,
                <br />
                made <em>undeniable</em>.
              </h1>
              <p className="lead">
                BuildMyArc interviews you, builds your operating profile, then
                runs your personal brand and distribution as one system - soon,
                from a single chat that works like an always-on employee.
              </p>

              <WaitForm
                submitted={submitted}
                onSubmitted={onSubmitted}
                note="Founding members lock early pricing and get the assistant first. No spam - just the launch."
              />

              <div className="trust">
                <span className="pip" /> Building toward 50,000 early builders ·
                From Muzamil Hasan
              </div>
            </div>

            {/* signature: the proactive assistant moment */}
            <div className="vignette reveal">
              <div
                className="device"
                role="img"
                aria-label="A chat with your BuildMyArc assistant, which has already drafted a post and is asking for approval."
              >
                <div className="chat-head">
                  <AssistantAvatar />
                  <div>
                    <div className="who">arc. assistant</div>
                    <div className="stat">● always on</div>
                  </div>
                </div>
                <div className="bubble">
                  <b>Morning.</b> Your audience is most active in 2 hrs. I drafted
                  a post on the AI-shift angle we mapped - in your voice.
                </div>
                <div className="bubble">
                  “Software is getting commoditized the way media did. The moat
                  moved to the people who can <b>tell the story</b>…”
                </div>
                <div className="bubble me">love it - schedule for LinkedIn + X</div>
                <div className="bubble">
                  Done. Queued for 9:40am. I'll line up the follow-up thread for
                  Thursday.
                </div>
                <div className="quick">
                  <span className="chip-btn go">Approve</span>
                  <span className="chip-btn">Edit</span>
                  <span className="chip-btn">Later</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ STAKES ============ */}
        <section id="stakes">
          <div className="wrap split">
            <div className="reveal">
              <span className="eyebrow muted">The problem</span>
              <h2>You do the work. The internet can't tell.</h2>
              <p className="lead">
                Your insight is real. But being known for it has become a second
                full-time job - and every tool built to help is one more thing to
                learn. So the people with the best ideas stay invisible, and the
                loudest win by default.
              </p>
            </div>
            <div className="visual reveal">
              <div className="noise" aria-hidden="true">
                <div className="bars">
                  {bars.map((h, i) => (
                    <i key={i} style={{ height: `${h}px` }} />
                  ))}
                </div>
                <div className="signal">
                  <svg className="ln" viewBox="0 0 120 120" fill="none">
                    <path d="M18 92 A56 56 0 0 1 96 44" stroke="#2BE0A0" strokeWidth={6} strokeLinecap="round" />
                    <circle cx="96" cy="44" r="9" fill="#2BE0A0" />
                  </svg>
                  <div
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: ".7rem",
                      letterSpacing: ".03em",
                      textTransform: "none",
                      color: "var(--pewter)",
                    }}
                  >
                    one clear signal
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ THE SHIFT ============ */}
        <section
          id="shift"
          style={{ background: "linear-gradient(180deg,transparent,rgba(28,36,40,.25),transparent)" }}
        >
          <div className="wrap split rev">
            <div className="visual reveal">
              <div className="curve-card">
                <div
                  className="ui-head"
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontFamily: "var(--mono)",
                    fontSize: ".66rem",
                    letterSpacing: ".03em",
                    textTransform: "none",
                    color: "var(--muted)",
                    marginBottom: ".6rem",
                  }}
                >
                  <span>Value over time</span>
                  <span className="accent">the divergence</span>
                </div>
                <svg
                  viewBox="0 0 420 220"
                  width="100%"
                  height="auto"
                  fill="none"
                  aria-label="A chart: the value of generic software falls as it is commoditized, while the value of personal narrative rises."
                >
                  <line x1="20" y1="200" x2="410" y2="200" stroke="#232B30" />
                  <line x1="20" y1="20" x2="20" y2="200" stroke="#232B30" />
                  <path d="M30 70 C140 70 230 120 405 175" stroke="#878F96" strokeWidth={2.5} strokeDasharray="5 5" strokeLinecap="round" />
                  <path d="M30 150 C150 150 250 120 405 35" stroke="#2BE0A0" strokeWidth={3} strokeLinecap="round" />
                  <circle cx="405" cy="35" r="6" fill="#2BE0A0" />
                  <text x="405" y="193" textAnchor="end" fill="#878F96" fontFamily="JetBrains Mono" fontSize="11">commoditized software</text>
                  <text x="398" y="28" textAnchor="end" fill="#2BE0A0" fontFamily="JetBrains Mono" fontSize="11">your narrative</text>
                </svg>
              </div>
            </div>
            <div className="reveal">
              <span className="eyebrow">The shift</span>
              <h2>Software got cheap. You became the moat.</h2>
              <p className="lead">
                As AI commoditizes the tools, the edge moves to the things only
                you have - narrative, taste, judgment, and distribution.
                BuildMyArc turns those into a system you can actually run, instead
                of a vague intention you keep postponing.
              </p>
            </div>
          </div>
        </section>

        {/* ============ PRODUCT REVEAL ============ */}
        <section id="product">
          <div className="wrap">
            <div className="reveal" style={{ maxWidth: "60ch" }}>
              <span className="eyebrow">Meet BuildMyArc</span>
              <h2>One system for the whole brand.</h2>
              <p className="lead">
                It starts by understanding you properly - then it never makes you
                start from a blank page again. Three moving parts, one loop.
              </p>
            </div>
            <div className="triad">
              <div className="tcard reveal">
                <div className="n">01 - Profile</div>
                <h3>It learns who you are</h3>
                <p>
                  A guided interview maps your positioning, ICP, audience
                  sentiment, goals and geography into a living operating profile.
                </p>
              </div>
              <div className="tcard reveal">
                <div className="n">02 - Distribute</div>
                <h3>It runs your output</h3>
                <p>
                  A content calendar wired to your channels, drafting in your
                  voice - so showing up stops depending on willpower.
                </p>
              </div>
              <div className="tcard reveal">
                <div className="n">03 - Grow</div>
                <h3>It shows your next move</h3>
                <p>
                  Field insights tell you what to build, say, and ship next to
                  move forward in your space - not just post more.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ FEATURES ============ */}
        <div id="features" />

        {/* Feature: Profile engine */}
        <section className="feature">
          <div className="wrap split">
            <div className="reveal">
              <div className="label">Profiling engine</div>
              <h2>It interviews you, then builds your profile.</h2>
              <p className="lead">
                No blank canvas, no "set up your brand." BuildMyArc asks the right
                questions and turns your answers into a structured profile -
                positioning, ideal audience, voice, goals, market - that every
                other part of the system runs on.
              </p>
            </div>
            <div className="visual reveal">
              <div className="ui" aria-label="Your profile: positioning, ICP, voice, goals and geography, each filling in.">
                <div className="ui-head">
                  <span>Your profile</span>
                  <span className="accent">86% complete</span>
                </div>
                <div className="row">
                  <span className="k">Positioning</span>
                  <span className="v">
                    <span className="tagp">AI × narrative strategy</span>
                  </span>
                </div>
                <div className="row">
                  <span className="k">Ideal audience</span>
                  <span className="v">
                    <span className="tagp">founders</span>
                    <span className="tagp">operators</span>
                  </span>
                </div>
                <div className="row">
                  <span className="k">Voice</span>
                  <span className="v">
                    <span className="meter">
                      <i style={{ width: "82%" }} />
                    </span>
                  </span>
                </div>
                <div className="row">
                  <span className="k">Goals</span>
                  <span className="v">
                    <span className="tagp">authority</span>
                    <span className="tagp">inbound</span>
                  </span>
                </div>
                <div className="row">
                  <span className="k">Geography</span>
                  <span className="v">
                    <span className="tagp">US · Gulf · Pakistan</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature: Distribution */}
        <section className="feature">
          <div className="wrap split rev">
            <div className="visual reveal">
              <div className="ui" aria-label="A content calendar with scheduled posts, connected to LinkedIn, X, YouTube and a newsletter.">
                <div className="ui-head">
                  <span>This week</span>
                  <span className="accent">7 posts queued</span>
                </div>
                <div className="cal">
                  <div className="d has" />
                  <div className="d" />
                  <div className="d has two" />
                  <div className="d has" />
                  <div className="d" />
                  <div className="d has" />
                  <div className="d has" />
                </div>
                <div className="nets">
                  <span className="net">
                    <span className="on" /> LinkedIn
                  </span>
                  <span className="net">
                    <span className="on" /> X
                  </span>
                  <span className="net">
                    <span className="on" /> Newsletter
                  </span>
                  <span className="net off">
                    <span className="on" /> YouTube
                  </span>
                </div>
              </div>
            </div>
            <div className="reveal">
              <div className="label">Distribution layer</div>
              <h2>A calendar wired to your channels.</h2>
              <p className="lead">
                Connect where you publish. BuildMyArc plans the rhythm, drafts in
                your voice, and keeps the cadence - so consistency becomes a
                setting, not a struggle. You stay in control; you approve
                everything.
              </p>
            </div>
          </div>
        </section>

        {/* Feature: Insight */}
        <section className="feature">
          <div className="wrap split">
            <div className="reveal">
              <div className="label">Insight & progress</div>
              <h2>Always know the next move.</h2>
              <p className="lead">
                BuildMyArc reads how you're landing in your field and tells you
                what to do next - the angle to take, the gap to fill, the thread
                worth pulling. Direction, not just a dashboard of numbers.
              </p>
            </div>
            <div className="visual reveal">
              <div className="ui">
                <div className="ui-head">
                  <span>Momentum</span>
                  <span className="accent">▲ trending up</span>
                </div>
                <svg className="chart" viewBox="0 0 380 150" width="100%" fill="none" aria-label="A rising momentum line.">
                  <path d="M10 130 C90 128 130 96 200 84 C270 72 320 40 372 22" stroke="#2BE0A0" strokeWidth={3} strokeLinecap="round" />
                  <path d="M10 130 C90 128 130 96 200 84 C270 72 320 40 372 22 L372 145 L10 145 Z" fill="url(#fade)" opacity=".25" />
                  <defs>
                    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#2BE0A0" />
                      <stop offset="1" stopColor="#2BE0A0" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <circle cx="372" cy="22" r="5" fill="#2BE0A0" />
                </svg>
                <div className="insight">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="#2BE0A0" strokeWidth={2} strokeLinecap="round" />
                    <circle cx="12" cy="12" r="3.5" stroke="#2BE0A0" strokeWidth={2} />
                  </svg>
                  <p>
                    <b style={{ color: "var(--text)" }}>Next move:</b> your take on
                    the "interaction layer" is resonating. Ship a 3-part thread
                    this week and pin it - it's your strongest claim to the topic.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature: The assistant (north star) */}
        <section
          className="feature"
          id="assistant"
          style={{ background: "linear-gradient(180deg,transparent,rgba(43,224,160,.05),transparent)" }}
        >
          <div className="wrap split rev">
            <div className="visual reveal">
              <div className="device" aria-label="The same assistant, working over a messaging app like WhatsApp.">
                <div className="chat-head">
                  <AssistantAvatar />
                  <div>
                    <div className="who">arc. assistant</div>
                    <div className="stat">● on WhatsApp</div>
                  </div>
                </div>
                <div className="bubble">
                  That podcast you did? I pulled 4 clips and wrote captions. Want
                  them out this week?
                </div>
                <div className="bubble me">yes, space them out</div>
                <div className="bubble">
                  On it. Also - a founder in your ICP just posted about pricing.
                  Good moment for your contrarian take. Draft it?
                </div>
                <div className="quick">
                  <span className="chip-btn go">Draft it</span>
                  <span className="chip-btn">Not now</span>
                </div>
              </div>
            </div>
            <div className="reveal">
              <span className="roadmap-tag">On the roadmap · founders first</span>
              <h2>Soon: your whole brand, run from a chat.</h2>
              <p className="lead">
                The hardest part of any tool is the tool. So the destination is no
                dashboard at all - one proactive assistant in the messaging apps
                you already use, quietly running the engine for you. As simple as
                texting a brilliant employee who never forgets and never sleeps.
              </p>
            </div>
          </div>
        </section>

        {/* ============ HOW IT WORKS ============ */}
        <section id="how">
          <div className="wrap">
            <div className="reveal" style={{ maxWidth: "56ch" }}>
              <span className="eyebrow">How it works</span>
              <h2>From blank page to brand, in three moves.</h2>
            </div>
            <div className="steps">
              <div className="step reveal">
                <h3>Answer a few smart questions</h3>
                <p>A guided interview - no setup, no blank canvas. It does the thinking with you.</p>
              </div>
              <div className="step reveal">
                <h3>Get your profile and your plan</h3>
                <p>Your operating profile plus a content calendar wired to your channels, in your voice.</p>
              </div>
              <div className="step reveal">
                <h3>Publish, and let it compound</h3>
                <p>Keep the cadence, follow the next move, and watch your signal build. Soon, the assistant handles the rest.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ WHY ============ */}
        <section id="why">
          <div className="wrap">
            <div className="reveal" style={{ maxWidth: "58ch" }}>
              <span className="eyebrow">Why BuildMyArc</span>
              <h2>Agency taste and AI speed - without the slop.</h2>
              <p className="lead">
                The alternatives each break somewhere. BuildMyArc is the system in
                the middle: the method of a strategist, run at the speed of
                software.
              </p>
            </div>
            <div className="reveal" style={{ overflowX: "auto" }}>
              <table className="cmp">
                <thead>
                  <tr>
                    <th />
                    <th>Hire an agency</th>
                    <th>Do it yourself</th>
                    <th>Generic AI tools</th>
                    <th className="us">BuildMyArc</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>Cost</th>
                    <td className="x">£££ / month</td>
                    <td className="y">free</td>
                    <td className="y">cheap</td>
                    <td className="us">one system</td>
                  </tr>
                  <tr>
                    <th>Sounds like you</th>
                    <td>sometimes</td>
                    <td className="y">yes</td>
                    <td className="x">slop</td>
                    <td className="us y">trained on you</td>
                  </tr>
                  <tr>
                    <th>Effort on you</th>
                    <td className="y">low</td>
                    <td className="x">very high</td>
                    <td className="x">high</td>
                    <td className="us y">low</td>
                  </tr>
                  <tr>
                    <th>Strategy built in</th>
                    <td className="y">yes</td>
                    <td className="x">no</td>
                    <td className="x">no</td>
                    <td className="us y">yes</td>
                  </tr>
                  <tr>
                    <th>Gets simpler over time</th>
                    <td className="x">no</td>
                    <td className="x">no</td>
                    <td className="x">no</td>
                    <td className="us y">a chat, soon</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ============ WHO ============ */}
        <section id="who">
          <div className="wrap">
            <div className="reveal" style={{ maxWidth: "56ch" }}>
              <span className="eyebrow muted">Who it's for</span>
              <h2>For people who'd rather build than broadcast.</h2>
            </div>
            <div className="who-grid">
              <div className="pcard reveal">
                <h3>Founders</h3>
                <p>Turn your conviction into the brand that pulls in talent, capital, and customers.</p>
              </div>
              <div className="pcard reveal">
                <h3>Operators</h3>
                <p>Make the expertise you've earned visible - without it eating your week.</p>
              </div>
              <div className="pcard reveal">
                <h3>Experts &amp; consultants</h3>
                <p>Become the name in your niche, so the right work finds you.</p>
              </div>
              <div className="pcard reveal">
                <h3>Creators</h3>
                <p>Trade the content treadmill for a system that compounds what you make.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ============ FOUNDER ============ */}
        <section id="founder">
          <div className="wrap founder">
            <div className="portrait reveal" aria-label="Portrait of Muzamil Hasan (placeholder - swap in founder photo).">
              <div className="ph">
                <svg className="glyph" viewBox="0 0 120 120" fill="none">
                  <path d="M24 84 A50 50 0 0 1 92 52" stroke="#ECEAE2" strokeWidth={8} strokeLinecap="round" />
                  <circle cx="92" cy="52" r="8" fill="#2BE0A0" />
                </svg>
                Portrait of Muzamil Hasan
                <br />- swap in image -
              </div>
            </div>
            <div className="reveal">
              <span className="eyebrow">Built by Muzamil Hasan</span>
              <blockquote>
                “I spent 15 years and 500+ interviews learning how people become
                known for what they know. BuildMyArc is that method, turned into a
                system.”
              </blockquote>
              <p className="lead">
                BuildMyArc is the product layer of{" "}
                <strong style={{ color: "var(--text)" }}>arc.</strong> - the calm
                operating system for building through the AI shift. The belief is
                simple: as software commoditizes, narrative becomes the moat. This
                is how you build yours.
              </p>
              <p style={{ marginTop: "1.5rem" }}>
                <a href="https://muzamilhasan.com" className="btn btn-ghost">
                  Meet Muzamil →
                </a>
              </p>
            </div>
          </div>
        </section>

        {/* ============ WAITLIST / FINAL CTA ============ */}
        <section className="final" id="waitlist">
          <div className="final-aura" aria-hidden="true" />
          <div className="wrap inner">
            <span className="eyebrow">Early access</span>
            <h2>Build your arc.</h2>
            <p className="lead" style={{ margin: "1rem auto 0" }}>
              Join the early list. Founding members lock early pricing, shape the
              product, and get the assistant first.
            </p>
            <WaitForm
              submitted={submitted}
              onSubmitted={onSubmitted}
              note="No spam - one note when it's your turn."
            />
            <div className="signoff">Build in silence. Arrive loud.</div>
          </div>
        </section>

        {/* ============ FAQ ============ */}
        <section id="faq">
          <div className="wrap" style={{ maxWidth: "820px" }}>
            <div className="reveal">
              <span className="eyebrow muted">Questions</span>
              <h2>Good things to know.</h2>
            </div>
            <div className="reveal" style={{ marginTop: "2rem" }}>
              {FAQS.map((f) => (
                <FaqItem key={f.q} q={f.q} a={f.a} />
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ============ FOOTER ============ */}
      <footer className="site">
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <a className="brand" href="#top">
                <BrandMark />
                <span>
                  Build<b>My</b>Arc<span className="dot">.</span>
                </span>
              </a>
              <p>The personal-brand engine in the arc. house. Build in silence. Arrive loud.</p>
            </div>
            <div className="foot-cols">
              <div className="foot-col">
                <h4>Product</h4>
                <a href="#how">How it works</a>
                <a href="#features">Features</a>
                <a href="#waitlist">Early access</a>
                <a href="#faq">FAQ</a>
              </div>
              <div className="foot-col">
                <h4>arc.</h4>
                <a href="https://muzamilhasan.com">muzamilhasan.com</a>
                <a href="#founder">Meet Muzamil</a>
                <a href="#">Community</a>
                <a href="#">Podcasts</a>
              </div>
              <div className="foot-col">
                <h4>Connect</h4>
                <a href="#">LinkedIn</a>
                <a href="#">X / Twitter</a>
                <a href="#">YouTube</a>
                <a href="#">Newsletter</a>
              </div>
            </div>
          </div>
          <div className="foot-base">
            <span>© {new Date().getFullYear()} arc. - a Muzamil Hasan project. All rights reserved.</span>
            <span>Privacy · Terms</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
