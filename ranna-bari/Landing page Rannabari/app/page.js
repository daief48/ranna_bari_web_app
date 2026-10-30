import styles from './page.module.css';

/*
 * Where the buttons go.
 *
 * Every call to action on this page was a <button> with no handler — it
 * looked clickable and did nothing. They are links now, and the targets live
 * here so a store listing or a domain change is one edit.
 *
 * TODO: replace the placeholders below with the real store listings and the
 * production web app URL before launch. Until then they point at the stores'
 * search pages and the backend host, which at least go somewhere honest.
 */
const APP_STORE_URL = 'https://apps.apple.com/search?term=rannabari'; // TODO: real App Store listing
const PLAY_STORE_URL = 'https://play.google.com/store/search?q=rannabari&c=apps'; // TODO: real Play listing
const WEB_APP_URL = 'https://ranna-bari-backend.netlify.app'; // TODO: the web app, once it has a domain
const CONTACT_EMAIL = 'hello@rannabari.app'; // TODO: confirm the mailbox exists

/* Pages that do not exist yet. Each goes to the mailbox with a subject so a
   click is still answered by a person rather than a 404. */
const mailto = (subject) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
const TERMS_URL = mailto('Terms of service'); // TODO: /terms once written
const PRICING_URL = mailto('Pricing and fees for cooks'); // TODO: /cooks/pricing once written
const GUIDELINES_URL = mailto('Menu guidelines'); // TODO: /cooks/guidelines once written
const DISPUTES_URL = mailto('Dispute with an order'); // TODO: /help/disputes once written

export default function Home() {
  return (
    <main className={styles.main}>
      {/* Background glow effects */}
      <div className={styles.glowBlob} style={{ top: '-10%', left: '-10%' }} aria-hidden="true" />
      <div className={styles.glowBlob} style={{ bottom: '20%', right: '-5%', animationDelay: '2s' }} aria-hidden="true" />

      {/* Navigation */}
      <header className={styles.header}>
        <div className={`container ${styles.nav}`}>
          <a href="#top" className={styles.logo} aria-label="RannaBari — back to top">
            RannaBari<span className={styles.logoDot}>.</span>
          </a>
          <nav className={styles.navLinks} aria-label="Sections">
            <a href="#system" className={styles.navLink}>How it works</a>
            <a href="#features" className={styles.navLink}>Features</a>
            <a href="#security" className={styles.navLink}>Security</a>
          </nav>
          <a href={PLAY_STORE_URL} className={`btn btn-primary ${styles.animateFadeUp}`}>
            Get the App
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <section id="top" className={styles.hero}>
        <div className={`container ${styles.heroContent}`}>
          <div className={`${styles.badge} animate-fade-up`}>Now in Dhaka</div>
          <h1 className={`${styles.heroTitle} animate-fade-up delay-100 text-gradient`}>
            Home-cooked meals,<br />from kitchens near you.
          </h1>
          <p className={`${styles.heroSubtitle} animate-fade-up delay-200`}>
            RannaBari connects home cooks in Bangladesh with people who want a proper
            meal. Order a plate for today, pre-book a month of lunches, or buy from a
            cook&apos;s pantry — every cook is identity-checked, and your money is held
            until the food arrives.
          </p>
          <div className={`${styles.heroActions} animate-fade-up delay-300`}>
            <a href={WEB_APP_URL} className="btn btn-primary">
              Find Local Kitchens
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </a>
            <a href={`${WEB_APP_URL}/become-cook`} className="btn btn-secondary">
              Open Your Kitchen
            </a>
          </div>
        </div>
      </section>

      {/* Bento Box System Breakdown */}
      <section id="system" className={styles.bentoSection}>
        <div className="container">
          <div className={styles.sectionHeader}>
            <h2 className={`${styles.sectionTitle} text-gradient`}>Built so both sides can trust it</h2>
            <p className={styles.sectionSubtitle}>
              The parts of RannaBari that make ordering from a stranger&apos;s kitchen feel safe.
            </p>
          </div>

          <div id="features" className={styles.bentoGrid}>

            {/* 1. Escrow System (Large) */}
            <div id="security" className={`glass-card ${styles.bentoLarge}`}>
              <div className={styles.bentoIcon} aria-hidden="true">🔒</div>
              <h3 className={styles.bentoTitle}>Your money waits for your food</h3>
              <p className={styles.bentoText}>
                When you confirm an order, the amount moves from your wallet into a hold.
                It reaches the cook only after you tap <b>&ldquo;Meal Received&rdquo;</b> — or, if
                something went wrong, our team can refund it. Every movement is a line in a
                ledger that nobody can edit afterwards.
              </p>

              <div className={styles.escrowVisual}>
                <div className={styles.escrowStep}>
                  <span>Your wallet</span>
                  <span>- ৳1,500</span>
                </div>
                <div className={styles.escrowStep}>
                  <span style={{color: 'var(--text-muted)'}}>↳ Held by RannaBari</span>
                  <span className={`${styles.statusPill} ${styles.pillPending}`}>Awaiting delivery</span>
                </div>
                <hr style={{borderColor: 'var(--glass-border)', margin: '0.5rem 0'}} />
                <div className={styles.escrowStep}>
                  <span>Cook&apos;s wallet</span>
                  <span className={`${styles.statusPill} ${styles.pillSuccess}`}>Released after delivery</span>
                </div>
              </div>
            </div>

            {/* 2. Flexible Meal Calendar (Tall) */}
            <div id="meals" className={`glass-card ${styles.bentoTall}`}>
              <div className={styles.bentoIcon} aria-hidden="true">📅</div>
              <h3 className={styles.bentoTitle}>Pick the days you want</h3>
              <p className={styles.bentoText}>
                No rigid monthly subscription. Choose the dates and the meals — breakfast
                on the 1st, dinner on the 5th — meet the cook&apos;s minimum, and check out.
              </p>

              <div className={styles.codeSnippet}>
                <div><span className="code-str">Sept 1</span> <span className="code-key">Breakfast</span> <span className="code-val">✅</span></div>
                <div><span className="code-str">Sept 1</span> <span className="code-key">Lunch</span> <span className="code-val">❌</span></div>
                <div><span className="code-str">Sept 5</span> <span className="code-key">Dinner</span> <span className="code-val">✅</span></div>
                <div style={{marginTop: '0.5rem', color: '#10B981'}}>Status: Validated</div>
              </div>
            </div>

            {/* 3. KYC (Small) */}
            <div id="kyc" className={`glass-card ${styles.bentoSmall}`}>
              <div className={styles.bentoIcon} aria-hidden="true">🛡️</div>
              <h3 className={styles.bentoTitle}>Identity-checked cooks</h3>
              <p className={styles.bentoText}>
                Every cook submits their National ID and photos of their kitchen, and a
                person reviews them before the kitchen can take an order.
              </p>
            </div>

            {/* 4. Chat (Small) */}
            <div id="chat" className={`glass-card ${styles.bentoSmall}`}>
              <div className={styles.bentoIcon} aria-hidden="true">💬</div>
              <h3 className={styles.bentoTitle}>Talk to the cook</h3>
              <p className={styles.bentoText}>
                Ask about a dish, request something custom, agree a price, and follow
                your order — in a chat with the person actually cooking it.
              </p>
            </div>

            {/* 5. Cook Autonomy (Wide) */}
            <div id="cooks" className={`glass-card ${styles.bentoWide}`}>
              <div className={styles.bentoIcon} aria-hidden="true">👨‍🍳</div>
              <h3 className={styles.bentoTitle}>Cooks run their own kitchen</h3>
              <p className={styles.bentoText}>
                Set your own menu and prices, choose how far you deliver, cap how many
                plates you cook per service, publish a monthly meal calendar, and run a
                small shop for jars, frozen goods and sweets alongside it.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.cta}>
        <div className="container">
          <div className={styles.ctaCard}>
            <h2 className={styles.ctaTitle}>Eat better. Cook for your neighbours.</h2>
            <p className={styles.ctaText}>
              RannaBari is starting in Dhaka. Get the app to order from kitchens near you,
              or to open your own.
            </p>
            <div className={styles.heroActions}>
              <a href={APP_STORE_URL} className={`btn ${styles.btnWhite}`}>
                Download for iOS
              </a>
              <a href={PLAY_STORE_URL} className={`btn ${styles.btnWhite}`}>
                Download for Android
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={`container ${styles.footerGrid}`}>
          <div className={styles.footerBrand}>
            <div className={styles.logo}>
              RannaBari<span className={styles.logoDot}>.</span>
            </div>
            <p className={styles.footerText}>
              A marketplace for home-cooked food in Bangladesh. Questions?{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className={styles.footerLink}>{CONTACT_EMAIL}</a>
            </p>
          </div>
          <div>
            <h4 className={styles.footerTitle}>Platform</h4>
            <ul className={styles.footerLinks}>
              <li><a href="#security" className={styles.footerLink}>How payments are held</a></li>
              <li><a href="#meals" className={styles.footerLink}>Monthly meals</a></li>
              <li><a href="#chat" className={styles.footerLink}>Chat with cooks</a></li>
            </ul>
          </div>
          <div>
            <h4 className={styles.footerTitle}>Trust &amp; Safety</h4>
            <ul className={styles.footerLinks}>
              <li><a href="#kyc" className={styles.footerLink}>Cook verification</a></li>
              <li><a href={DISPUTES_URL} className={styles.footerLink}>Dispute an order</a></li>
              <li><a href={TERMS_URL} className={styles.footerLink}>Terms of Service</a></li>
            </ul>
          </div>
          <div>
            <h4 className={styles.footerTitle}>Cooks</h4>
            <ul className={styles.footerLinks}>
              <li><a href={`${WEB_APP_URL}/become-cook`} className={styles.footerLink}>Open your kitchen</a></li>
              <li><a href={PRICING_URL} className={styles.footerLink}>Pricing &amp; Fees</a></li>
              <li><a href={GUIDELINES_URL} className={styles.footerLink}>Menu Guidelines</a></li>
            </ul>
          </div>
        </div>
        <div className={`container ${styles.footerBottom}`}>
          <p>&copy; {new Date().getFullYear()} RannaBari. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
