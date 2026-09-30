import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, MapPin, Menu, Sprout } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { roleHome } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { brand } from "@/lib/brand";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.css";
import "react-leaflet-cluster/dist/assets/MarkerCluster.Default.css";
import "./design-system.css";

export const metadata: Metadata = {
  title: { default: `${brand.name} | ${brand.tagline}`, template: `%s | ${brand.name}` },
  description: `${brand.positioning} Report civic issues, follow verified progress and explore transparent community funding. Reporting is currently active in Karachi.`,
};
function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return <Link href="/" className={`brand ${inverse ? "brand-inverse" : ""}`} aria-label={`${brand.name} home`}><span className="brand-mark"><Sprout size={25} strokeWidth={1.8} /></span><span>{brand.shortName}<span className="brand-country">Pakistan</span></span></Link>;
}
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  const links = [{ href: "/report", label: "Report an issue" }, { href: "/projects", label: "Our projects" }, { href: "/funds", label: "Our funds" }, { href: "/map", label: "Explore map" }];
  const more = [{ href: "/cities", label: "Choose your city" }, { href: "/track", label: "Track a complaint" }, { href: "/help", label: "Assistant & help" }, { href: user?.role === "VOLUNTEER" ? "/dashboard" : user ? roleHome(user.role) : "/dashboard", label: "My dashboard" }, ...(user ? [{ href: "/notifications", label: "Notifications" }] : [])];
  return <html lang="en"><body><a href="#main-content" className="skip-link">Skip to content</a>
    <div className="coverage-strip"><div><span className="coverage-dot" /> {brand.activeCityName} is live <span className="coverage-divider">/</span> <span>Growing city by city, with care.</span><Link href="/cities">Choose your city <ArrowUpRight size={12} /></Link></div></div>
    <header className="site-header"><div className="header-shell"><BrandMark /><nav className="desktop-navigation" aria-label="Main navigation">{links.map(link => <Link className="nav-link" href={link.href} key={link.href}>{link.label}</Link>)}<details className="nav-more"><summary>More</summary><div>{more.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}</div></details></nav><div className="header-actions"><Link href="/donate" className="header-donate">Help us <ArrowUpRight size={15} /></Link>{user ? <form action={logoutAction}><button className="login-link" type="submit">Log out</button></form> : <Link className="login-link" href="/login">Sign in</Link>}<details className="mobile-menu"><summary aria-label="Open navigation"><Menu size={22} /></summary><nav aria-label="Mobile navigation">{[...links, ...more].map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}</nav></details></div></div></header>
    <main id="main-content">{children}</main>
    <footer className="site-footer"><div className="footer-grid"><div><BrandMark inverse /><p className="footer-tagline">{brand.tagline}</p><p className="footer-copy">A shared responsibility.<br />A better place to call home.</p><span className="footer-city"><MapPin size={14} /> Currently serving Karachi</span></div><div><h2>Make a difference</h2><Link href="/report">Report an issue</Link><Link href="/volunteer/apply">Become a volunteer</Link><Link href="/donate">Support community work</Link></div><div><h2>See the progress</h2><Link href="/projects">Our projects</Link><Link href="/funds">Our funds</Link><Link href="/map">Explore Karachi</Link></div><div><h2>Stay connected</h2><Link href="/track">Track a complaint</Link><Link href="/help">{brand.assistantName}</Link><Link href="/dashboard">Your dashboard</Link></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} {brand.name}</span><span>{brand.positioning}</span><span>Built on trust. Open about progress.</span></div></footer>
  </body></html>;
}
