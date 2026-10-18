import styles from './page.module.css';

export default function Home() {
  return (
    <main className={styles.main}>
      {/* Background glow effects */}
      <div className={styles.glowBlob} style={{ top: '-10%', left: '-10%' }} />
      <div className={styles.glowBlob} style={{ bottom: '20%', right: '-5%', animationDelay: '2s' }} />

      {/* Navigation */}
      <header className={styles.header}>
        <div className={`container ${styles.nav}`}>
          <div className={styles.logo}>
            RannaBari<span className={styles.logoDot}>.</span>
          </div>
          <div className={styles.navLinks}>
            <a href="#system" className={styles.navLink}>System</a>
            <a href="#features" className={styles.navLink}>Features</a>
            <a href="#security" className={styles.navLink}>Security</a>
          </div>
          <button className={`btn btn-primary ${styles.animateFadeUp}`}>Get the App</button>
        </div>
      </header>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={`container ${styles.heroContent}`}>
          <div className={`${styles.badge} animate-fade-up`}>Version 2.0 Live</div>
          <h1 className={`${styles.heroTitle} animate-fade-up delay-100 text-gradient`}>
            Next-Gen Home Kitchen<br />Marketplace Ecosystem.
          </h1>
          <p className={`${styles.heroSubtitle} animate-fade-up delay-200`}>
            Not just another food delivery app. RannaBari is a highly engineered ecosystem 
            empowering home cooks with powerful culinary tools, and giving food lovers 
            unprecedented flexibility and financial security.
          </p>
          <div className={`${styles.heroActions} animate-fade-up delay-300`}>
            <button className="btn btn-primary">
              Find Local Kitchens
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
            </button>
            <button className="btn btn-secondary">
              Open Your Kitchen
            </button>
          </div>
        </div>
      </section>

      {/* Bento Box System Breakdown */}
      <section id="system" className={styles.bentoSection}>
        <div className="container">
          <div className={styles.sectionHeader}>
            <h2 className={`${styles.sectionTitle} text-gradient`}>Engineered for Trust & Flexibility</h2>
            <p className={styles.sectionSubtitle}>Dive into the core mechanics that make RannaBari the most advanced peer-to-peer food platform.</p>
          </div>

          <div className={styles.bentoGrid}>
            
            {/* 1. Escrow System (Large) */}
            <div className={`glass-card ${styles.bentoLarge}`}>
              <div className={styles.bentoIcon}>🔒</div>
              <h3 className={styles.bentoTitle}>Double-Entry Escrow Ledger</h3>
              <p className={styles.bentoText}>
                No more payment anxiety. When you confirm an order, your money is securely transferred from your Wallet into our System Hold. It is only released to the cook's wallet once you physically tap <b>"Meal Received"</b>.
              </p>
              
              <div className={styles.escrowVisual}>
                <div className={styles.escrowStep}>
                  <span>User Wallet</span>
                  <span>- ৳1,500</span>
                </div>
                <div className={styles.escrowStep}>
                  <span style={{color: 'var(--text-muted)'}}>↳ System Hold (Escrow)</span>
                  <span className={`${styles.statusPill} ${styles.pillPending}`}>Awaiting Delivery</span>
                </div>
                <hr style={{borderColor: 'var(--glass-border)', margin: '0.5rem 0'}} />
                <div className={styles.escrowStep}>
                  <span>Cook Wallet</span>
                  <span className={`${styles.statusPill} ${styles.pillSuccess}`}>Released post-delivery</span>
                </div>
              </div>
            </div>

            {/* 2. Flexible Meal Calendar (Tall) */}
            <div className={`glass-card ${styles.bentoTall}`}>
              <div className={styles.bentoIcon}>📅</div>
              <h3 className={styles.bentoTitle}>Flexible Meal Selection</h3>
              <p className={styles.bentoText}>
                Forget rigid monthly subscriptions. Our Date + Meal Type selection algorithm lets you pick exactly what you want. 
                <br/><br/>
                Want Breakfast on the 1st, and Dinner on the 5th? You got it. Just meet the cook's minimum meal requirement and check out.
              </p>
              
              <div className={styles.codeSnippet}>
                <div><span className="code-str">Sept 1</span> <span className="code-key">Breakfast</span> <span className="code-val">✅</span></div>
                <div><span className="code-str">Sept 1</span> <span className="code-key">Lunch</span> <span className="code-val">❌</span></div>
                <div><span className="code-str">Sept 5</span> <span className="code-key">Dinner</span> <span className="code-val">✅</span></div>
                <div style={{marginTop: '0.5rem', color: '#10B981'}}>Status: Validated</div>
              </div>
            </div>

            {/* 3. KYC (Small) */}
            <div className={`glass-card ${styles.bentoSmall}`}>
              <div className={styles.bentoIcon}>🛡️</div>
              <h3 className={styles.bentoTitle}>Strict KYC</h3>
              <p className={styles.bentoText}>
                Every single cook undergoes strict identity document verification before their kitchen goes live on the map.
              </p>
            </div>

            {/* 4. Real-time Marketplace (Small) */}
            <div className={`glass-card ${styles.bentoSmall}`}>
              <div className={styles.bentoIcon}>⚡</div>
              <h3 className={styles.bentoTitle}>Live WebSocket Chat</h3>
              <p className={styles.bentoText}>
                Negotiate prices, request custom dishes, and track your order in real-time with zero-latency chat.
              </p>
            </div>

            {/* 5. Cook Autonomy (Wide) */}
            <div className={`glass-card ${styles.bentoWide}`}>
              <div className={styles.bentoIcon}>👨‍🍳</div>
              <h3 className={styles.bentoTitle}>Total Kitchen Autonomy</h3>
              <p className={styles.bentoText}>
                Cooks are in complete control. Override system meal plans, set custom pricing, define specific delivery radius zones, set plate caps per service, and even run a virtual shelf for packaged goods with a pre-order queue.
              </p>
            </div>

          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.cta}>
        <div className="container">
          <div className={styles.ctaCard}>
            <h2 className={styles.ctaTitle}>Experience the Future of Home Food</h2>
            <p className={styles.ctaText}>
              Join the ecosystem that is reshaping how communities share, sell, and enjoy home-cooked meals across Bangladesh.
            </p>
            <button className={`btn ${styles.btnWhite}`}>
              Download for iOS & Android
            </button>
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
              The next-generation home-kitchen marketplace connecting communities through technology and food.
            </p>
          </div>
          <div>
            <h4 className={styles.footerTitle}>Platform</h4>
            <ul className={styles.footerLinks}>
              <li><a href="#" className={styles.footerLink}>The Escrow System</a></li>
              <li><a href="#" className={styles.footerLink}>Meal Algorithms</a></li>
              <li><a href="#" className={styles.footerLink}>Live Marketplace</a></li>
            </ul>
          </div>
          <div>
            <h4 className={styles.footerTitle}>Trust & Safety</h4>
            <ul className={styles.footerLinks}>
              <li><a href="#" className={styles.footerLink}>KYC Verification</a></li>
              <li><a href="#" className={styles.footerLink}>Dispute Resolution</a></li>
              <li><a href="#" className={styles.footerLink}>Terms of Service</a></li>
            </ul>
          </div>
          <div>
            <h4 className={styles.footerTitle}>Cooks</h4>
            <ul className={styles.footerLinks}>
              <li><a href="#" className={styles.footerLink}>Kitchen Dashboard</a></li>
              <li><a href="#" className={styles.footerLink}>Pricing & Fees</a></li>
              <li><a href="#" className={styles.footerLink}>Menu Guidelines</a></li>
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
