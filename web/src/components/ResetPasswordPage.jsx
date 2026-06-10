import { Link } from 'react-router-dom';
import BrandLogo from './BrandLogo.jsx';

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-hc-bg px-4">
      <div className="bg-hc-panel border border-hc-panel-border rounded-xl shadow-sm w-full max-w-sm p-6 space-y-6">
        <div className="flex justify-center">
          <BrandLogo className="h-10" />
        </div>

        <div>
          <h1 className="text-hc-page-title font-semibold text-hc-fg text-center">Reset password</h1>
          <p className="text-hc-body text-hc-muted-light text-center mt-2">
            Password reset will be available in an upcoming update.
          </p>
        </div>

        <div className="text-center">
          <Link
            to="/login"
            className="text-hc-caption text-hc-muted hover:text-hc-fg underline-offset-2 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
