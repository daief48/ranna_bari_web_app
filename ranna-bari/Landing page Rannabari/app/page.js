import styles from './page.module.css';

export default function Home() {
  return (
    <main className={styles.main}>
      {/* Navigation */}
      <header className={styles.header}>
        <div className={`container ${styles.nav}`}>
          <div className={styles.logo}>RannaBari.</div>
          <div className={styles.navLinks}>
            <a href="#features" className={styles.navLink}>Features</a>
            <a href="#how-it-works" className={styles.navLink}>How it Works</a>
            <a href="#testimonials" className={styles.navLink}>Reviews</a>
          </div>
          <button className={`btn btn-primary ${styles.animateFadeUp}`}>Get the App</button>
        </div>
      </header>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroBg}></div>
        <div className="container">
          <h1 className={`${styles.heroTitle} animate-fade-up`}>
            Your Neighborhood,<br />Your Kitchen.
          </h1>
          <p className={`${styles.heroSubtitle} animate-fade-up delay-100`}>
            A vibrant Bangladeshi home-kitchen marketplace. Order fresh, homemade meals from your neighbors, or start your own kitchen and share your culinary passion with the community.
          </p>
          <div className={`${styles.heroActions} animate-fade-up delay-200`}>
            <button className="btn btn-primary">Find a Kitchen</button>
            <button className="btn btn-secondary">Become a Cook</button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className={styles.features}>
        <div className="container">
          <h2 className={styles.sectionTitle}>One Platform. Two Experiences.</h2>
          <div className={styles.featuresGrid}>
            <div className="glass-card">
              <div className={styles.featureIcon}>🍲</div>
              <h3 className={styles.featureTitle}>For Food Lovers</h3>
              <p className={styles.featureText}>
                Discover local kitchens around you. Browse menus, join meal boards for tomorrow's lunch, or request custom dishes. Your money is held in escrow until you receive the food.
              </p>
            </div>
            <div className="glass-card">
              <div className={styles.featureIcon}>👨‍🍳</div>
              <h3 className={styles.featureTitle}>For Home Cooks</h3>
              <p className={styles.featureText}>
                Turn your kitchen into a business. Set your own delivery radius, list a daily meal board with plate caps, and sell packaged goods off your virtual shelf.
              </p>
            </div>
            <div className="glass-card">
              <div className={styles.featureIcon}>💬</div>
              <h3 className={styles.featureTitle}>Live Marketplace</h3>
              <p className={styles.featureText}>
                Chat directly with cooks over live WebSockets. Request a specific meal, receive bids, and get real-time updates on your order's journey.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className={styles.steps}>
        <div className="container">
          <h2 className={styles.sectionTitle}>How RannaBari Works</h2>
          <div className={styles.stepsGrid}>
            <div className="glass-card">
              <div className={styles.stepNumber}>01</div>
              <h3 className={styles.featureTitle}>Discover</h3>
              <p className={styles.featureText}>Open the app to see a live map of kitchens and dishes near you. Everything is ranked by distance.</p>
            </div>
            <div className="glass-card">
              <div className={styles.stepNumber}>02</div>
              <h3 className={styles.featureTitle}>Order & Hold</h3>
              <p className={styles.featureText}>Place your order. Your payment is securely held in escrow and is only released when your food arrives.</p>
            </div>
            <div className="glass-card">
              <div className={styles.stepNumber}>03</div>
              <h3 className={styles.featureTitle}>Enjoy</h3>
              <p className={styles.featureText}>Receive your hot, fresh, home-cooked meal directly from your neighbor's kitchen.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className={styles.cta}>
        <div className="container">
          <h2 className={styles.ctaTitle}>Ready to taste the neighborhood?</h2>
          <p className={styles.ctaText}>
            Join thousands of food lovers and cooks building a better local food ecosystem in Bangladesh.
          </p>
          <button className={`btn ${styles.btnWhite}`}>Download RannaBari</button>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={`container ${styles.footerGrid}`}>
          <div className={styles.footerBrand}>
            <div className={styles.logo}>RannaBari.</div>
            <p className={styles.footerText}>
              The home-kitchen marketplace connecting communities through food.
            </p>
          </div>
          <div>
            <h4 className={styles.footerTitle}>Company</h4>
            <ul className={styles.footerLinks}>
              <li><a href="#" className={styles.footerLink}>About Us</a></li>
              <li><a href="#" className={styles.footerLink}>Careers</a></li>
              <li><a href="#" className={styles.footerLink}>Press</a></li>
            </ul>
          </div>
          <div>
            <h4 className={styles.footerTitle}>Support</h4>
            <ul className={styles.footerLinks}>
              <li><a href="#" className={styles.footerLink}>Help Center</a></li>
              <li><a href="#" className={styles.footerLink}>Safety</a></li>
              <li><a href="#" className={styles.footerLink}>Terms of Service</a></li>
            </ul>
          </div>
          <div>
            <h4 className={styles.footerTitle}>Cooks</h4>
            <ul className={styles.footerLinks}>
              <li><a href="#" className={styles.footerLink}>Become a Cook</a></li>
              <li><a href="#" className={styles.footerLink}>Seller Guidelines</a></li>
              <li><a href="#" className={styles.footerLink}>Success Stories</a></li>
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
