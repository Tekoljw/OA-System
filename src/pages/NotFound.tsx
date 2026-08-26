
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Link } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="text-center max-w-md p-6 rounded-lg bg-card border border-border shadow-sm">
        <h1 className="text-5xl font-bold text-primary mb-4">404</h1>
        <p className="text-xl text-foreground mb-6">页面不存在</p>
        <p className="text-muted-foreground mb-8">
          您尝试访问的页面不存在或已被移除。
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-md font-medium transition-colors hover:bg-primary/90"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
