// @ts-nocheck
import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <p className="text-7xl font-black text-primary/20">404</p>
        <h1 className="text-2xl font-bold text-foreground">Page not found</h1>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">The page you're looking for doesn't exist or was moved.</p>
        <Button onClick={() => navigate("/")} className="gap-2 mt-2">
          <Home className="h-4 w-4" />Back to Dashboard
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
