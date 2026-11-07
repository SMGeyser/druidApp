// UI state contains email and feedback only. Passwords live in the form DOM and
// the scope of the request that uses them, never in this state or browser storage.
export class AuthFlow {
  constructor() {
    this.view = 'signin'; this.email = ''; this.error = ''; this.notice = '';
    this.fields = {}; this.busy = false; this.sentFor = null; this.serial = 0;
  }
  change(view, email = this.email) {
    if (!['signin', 'signup', 'forgot'].includes(view)) return false;
    this.serial++; this.view = view; this.email = email.trim();
    this.error = ''; this.notice = ''; this.fields = {}; this.busy = false; this.sentFor = null;
    return true;
  }
  close() { this.change('signin'); }
  begin(email) {
    if (this.busy) return null;
    this.email = email.trim(); this.error = ''; this.notice = ''; this.fields = {}; this.busy = true;
    return { serial: ++this.serial, view: this.view };
  }
  active(ticket) { return ticket?.serial === this.serial && ticket.view === this.view; }
  fail(ticket, error) {
    if (!this.active(ticket)) return false;
    this.busy = false; this.error = authErrorMessage(error, ticket.view); return true;
  }
  sent(ticket) {
    if (!this.active(ticket)) return false;
    this.serial++; this.sentFor = ticket.view; this.view = 'sent'; this.busy = false;
    this.error = ''; this.fields = {}; return true;
  }
  finish(ticket) {
    if (!this.active(ticket)) return false;
    this.serial++; this.busy = false; this.error = ''; this.fields = {}; return true;
  }
}

export function validateAuth(view, { email = '', password = '', confirm = '' }) {
  const fields = {};
  if (view !== 'password') {
    if (!email.trim()) fields.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fields.email = 'Enter a valid email address.';
  }
  if (view !== 'forgot') {
    if (!password) fields.password = 'Enter your password.';
    else if (view !== 'signin' && password.length < 8) fields.password = 'Use at least 8 characters.';
  }
  if (view === 'password' && password !== confirm) fields.confirm = 'Passwords do not match.';
  return fields;
}

export function authErrorMessage(error, view = 'signin') {
  const code = String(error?.code || '').toLowerCase();
  const detail = String(error?.message || '').toLowerCase();
  if (code === 'invalid_credentials' || /invalid login credentials/.test(detail)) return 'The email or password is incorrect. Please try again.';
  if (code === 'email_not_confirmed' || /email not confirmed/.test(detail)) return 'Confirm your email before signing in. Check your inbox for the confirmation link.';
  if (['user_already_exists', 'email_exists'].includes(code) || /already registered/.test(detail)) return 'An account with this email already exists. Sign in or reset your password.';
  if (error?.status === 429 || /rate_limit|too_many/.test(code) || /rate limit|too many requests/.test(detail)) return 'Too many attempts. Please wait a few minutes and try again.';
  if (code === 'email_address_invalid') return 'Enter a valid email address.';
  if (code === 'weak_password') return 'Choose a stronger password with at least 8 characters.';
  if (code === 'same_password') return 'Choose a password different from your current password.';
  if (code === 'signup_disabled') return 'Account creation is unavailable right now. Please try again later.';
  if (['otp_expired', 'flow_state_expired', 'flow_state_not_found', 'bad_code_verifier', 'auth_session_missing', 'session_not_found'].includes(code) || view === 'link') return 'This email link is no longer valid. Request a new link and open it in the same browser.';
  if (error?.name === 'AuthRetryableFetchError' || /fetch|network|timed out|timeout|connection|aborted/.test(detail)) return 'We couldn’t connect. Check your connection and try again.';
  if (code === 'email_address_not_authorized' || /smtp|sending.*email|send.*email|email.*send/.test(detail)) return 'We couldn’t send the email. Please try again in a few minutes.';
  return ({ signin: 'We couldn’t sign you in. Please try again.', signup: 'We couldn’t create your account. Please try again.',
    forgot: 'We couldn’t send a reset link. Please try again in a few minutes.', password: 'We couldn’t update your password. Please try again.' })[view] || 'Something went wrong. Please try again.';
}
