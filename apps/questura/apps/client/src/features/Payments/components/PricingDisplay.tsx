export default function PricingDisplay() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Join Our Membership
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300">
          Choose the plan that works best for you
        </p>
      </div>

      <div className="grid 768:grid-cols-1 gap-8 max-w-4xl mx-auto">
        {/* Monthly Plan */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 border border-gray-200 dark:border-gray-700">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
              Monthly Plan
            </h2>
            <div className="mb-4">
              <span className="text-4xl font-bold text-gray-900 dark:text-white">
                $10
              </span>
              <span className="text-gray-600 dark:text-gray-300">/month</span>
            </div>
            <p className="text-gray-600 dark:text-gray-300">
              Perfect for trying out our premium features
            </p>
          </div>

          <ul className="mb-8 space-y-3">
            <li className="flex items-center text-gray-700 dark:text-gray-300">
              <svg
                className="w-5 h-5 text-green-500 mr-3"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              All premium features
            </li>
            <li className="flex items-center text-gray-700 dark:text-gray-300">
              <svg
                className="w-5 h-5 text-green-500 mr-3"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              Priority support
            </li>
            <li className="flex items-center text-gray-700 dark:text-gray-300">
              <svg
                className="w-5 h-5 text-green-500 mr-3"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              Cancel anytime
            </li>
          </ul>

          <a
            href="/purchase/monthly"
            className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors text-center cursor-pointer"
          >
            Subscribe Monthly
          </a>
        </div>
      </div>
    </div>
  );
}
