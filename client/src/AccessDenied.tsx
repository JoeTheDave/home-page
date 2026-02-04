function AccessDenied() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
        <div className="text-6xl mb-4">🔒</div>
        <h1 className="text-3xl font-bold text-gray-800 mb-4">
          Access Restricted
        </h1>
        <p className="text-gray-600 mb-6">
          This is a private application. You need an invitation to access it.
        </p>
        <p className="text-sm text-gray-500 mb-8">
          If you believe you should have access, please contact the application
          administrator.
        </p>
        <a
          href="/"
          className="inline-block bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-colors"
        >
          Go Back
        </a>
      </div>
    </div>
  );
}

export default AccessDenied;
