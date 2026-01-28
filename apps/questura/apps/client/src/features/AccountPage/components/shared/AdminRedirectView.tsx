export function AdminRedirectView() {
  return (
    <div className="max-w-md mx-auto mt-20 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-lg">
      <h1 className="text-2xl font-bold text-center mb-6">Admin Access</h1>
      <p className="text-gray-600 dark:text-gray-300 text-center mb-6">
        Admin and editor accounts use the admin panel.
      </p>
      <div className="text-center">
        <a
          href="/admin"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors inline-block cursor-pointer"
        >
          Go to Admin Panel
        </a>
      </div>
    </div>
  );
}