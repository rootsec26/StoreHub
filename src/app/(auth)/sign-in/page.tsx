import LoginPage from "../login/page";

// Alias route: the landing page CTA points at /sign-in, which renders the
// same sign-in form (and auth layout) as /login.
export default function SignInPage() {
  return <LoginPage />;
}
