import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wifi, LogIn, UserPlus, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useBranding } from "@/hooks/useBranding";
import { useToast } from "@/hooks/use-toast";

const AuthPage = () => {
  const { branding } = useBranding();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        toast({ title: "Account created", description: "Check your email to verify, then an admin will assign your role." });
      }
    } catch (error: any) {
      toast({ title: isLogin ? "Login failed" : "Sign up failed", description: error?.message || "Unknown error", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({ title: "Reset email sent", description: "Check your inbox for the reset link." });
      setShowForgot(false);
    } catch (error: any) {
      toast({ title: "Error", description: error?.message || "Failed to send reset email", variant: "destructive" });
    } finally { setLoading(false); }
  };

  if (showForgot) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm glass-card p-8 space-y-6">
          <button onClick={() => setShowForgot(false)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Back to login
          </button>
          <div className="text-center">
            <h1 className="text-xl font-bold">Reset Password</h1>
            <p className="text-sm text-muted-foreground mt-1">Enter your email to receive a reset link</p>
          </div>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <Label htmlFor="reset-email" className="text-xs">Email</Label>
              <Input id="reset-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="mt-1" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Send Reset Link"}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm glass-card p-8 space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center">
            <Wifi className="h-6 w-6 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold">{branding.company_name}</h1>
            <p className="text-xs text-muted-foreground">{isLogin ? "Sign in to continue" : "Create an account"}</p>
          </div>
        </div>
        <form onSubmit={handleAuth} className="space-y-4">
          {!isLogin && (
            <div>
              <Label htmlFor="fullName" className="text-xs">Full Name</Label>
              <Input id="fullName" value={fullName} onChange={e => setFullName(e.target.value)} required className="mt-1" />
            </div>
          )}
          <div>
            <Label htmlFor="email" className="text-xs">Email</Label>
            <Input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="password" className="text-xs">Password</Label>
            <div className="relative mt-1">
              <Input id="password" type={showPwd ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} required className="pr-10" />
              <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full gap-2" disabled={loading}>
            {loading ? "Please wait..." : isLogin ? <><LogIn className="h-4 w-4" /> Sign In</> : <><UserPlus className="h-4 w-4" /> Create Account</>}
          </Button>
        </form>
        <div className="text-center space-y-2">
          <button type="button" onClick={() => setIsLogin(!isLogin)} className="text-xs text-primary hover:underline">
            {isLogin ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>
          {isLogin && (
            <button type="button" onClick={() => setShowForgot(true)} className="block w-full text-xs text-muted-foreground hover:text-foreground">
              Forgot password?
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
