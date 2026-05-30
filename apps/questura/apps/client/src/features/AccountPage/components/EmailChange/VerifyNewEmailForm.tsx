interface VerifyNewEmailFormProps {
  newEmail: string;
  onBack: () => void;
}

export default function VerifyNewEmailForm({
  newEmail,
  onBack,
}: VerifyNewEmailFormProps) {
  return (
    <div>
      <div className="space-y-4">
        <p className="text-[0.88rem] text-[#6b6a68] leading-[1.65] mb-1">
          We&apos;ve sent a verification link to <strong className="text-[#1A1A1A]">{newEmail}</strong>. Open that
          link from your email to finish changing your address.
        </p>

        <div className="bg-white border border-[#e5e2dc] rounded-sm p-3.5">
          <p className="text-[0.78rem] text-[#9a9894] leading-[1.65]">
            Verification links expire after a short window. If it expires, go back and request a new email-change link.
          </p>
        </div>
      </div>

      <div className="flex gap-3 mt-7">
        <button
          type="button"
          onClick={() => {
            window.location.href = '/account'
          }}
          className="
            flex-1 bg-[#2C2C2C] hover:bg-[#1A1A1A]
            text-white text-center py-3 rounded
            text-[0.88rem] font-medium transition-colors
          "
        >
          Done
        </button>
        <button
          type="button"
          onClick={onBack}
          className="
            flex-1 bg-white border border-[#d7d4ce]
            text-[#4f4e4b] text-center py-3 rounded
            text-[0.88rem] font-medium transition-colors
            hover:bg-[#f0efeb]
          "
        >
          Back
        </button>
      </div>
    </div>
  );
}
