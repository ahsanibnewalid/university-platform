import Link from "next/link";

export default function RetiredInvitationPage() {
  return <main className="college-auth-simple"><section className="college-auth-panel">
    <span className="college-auth-kicker">Siddheswari College · Official access</span>
    <h1>Account invitations have been replaced.</h1>
    <p>Students now activate a college-issued student ID and password. Teachers, staff and college leadership register through a pre-approved Gmail address.</p>
    <div className="college-auth-form">
      <Link className="auth-submit" href="/register/student">Student ID registration</Link>
      <Link className="college-back-link" href="/register/staff">Staff / Teacher Gmail registration</Link>
      <Link className="college-back-link" href="/login">Back to sign in</Link>
    </div>
  </section></main>;
}
