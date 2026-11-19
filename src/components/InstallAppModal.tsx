import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Share,
  PlusSquare,
  Check,
  MoreVertical,
  Download,
  Smartphone,
  Copy,
  Apple,
  Monitor,
} from 'lucide-react';
import { toast } from 'sonner';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { ApexMark } from '@/components/ApexBrand';
import { useAuth } from '@/contexts/AuthContext';
import { getTierTheme } from '@/lib/tierTheme';

interface InstallAppModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InstallAppModal({ open, onOpenChange }: InstallAppModalProps) {
  const { canInstall, platform, prompt } = useInstallPrompt();
  const [activeTab, setActiveTab] = useState<'ios' | 'android' | 'desktop'>('ios');
  const { effectivePlan } = useAuth();
  const { navBg: tierNavBg, border: tierBorder } = getTierTheme(effectivePlan);


  const handleNativeInstall = async () => {
    const outcome = await prompt();
    if (outcome === 'accepted') {
      toast.success('Installing Apex Golf Academy…');
      onOpenChange(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText('https://margeagolfacademy.com');
      toast.success('Link copied — open it on your phone');
    } catch {
      toast.error('Could not copy link');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md text-ivory"
        style={{
          background: tierNavBg,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderTop: `1px solid ${tierBorder}`,
          boxShadow: '0 10px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        <div className="flex justify-center -mt-2 mb-1">
          <ApexMark size="lg" glow />
        </div>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-ivory">
            <Smartphone className="h-5 w-5 text-gold-accent" />
            Install on your Home Screen
          </DialogTitle>
          <DialogDescription className="text-ivory/60">
            One-tap access, fullscreen, no browser bars.
          </DialogDescription>
        </DialogHeader>


        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid grid-cols-3 bg-white/5 border border-white/10">
            <TabsTrigger value="ios" className="data-[state=active]:bg-green-accent data-[state=active]:text-ivory text-ivory/70">
              <Apple className="h-4 w-4 mr-1" /> iPhone
            </TabsTrigger>
            <TabsTrigger value="android" className="data-[state=active]:bg-green-accent data-[state=active]:text-ivory text-ivory/70">
              <Smartphone className="h-4 w-4 mr-1" /> Android
            </TabsTrigger>
            <TabsTrigger value="desktop" className="data-[state=active]:bg-green-accent data-[state=active]:text-ivory text-ivory/70">
              <Monitor className="h-4 w-4 mr-1" /> Desktop
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ios" className="space-y-3 mt-4">
            <Step
              n={1}
              icon={<Share className="h-5 w-5 text-gold-accent" />}
              title="Tap the Share button"
              detail="In Safari, tap the square-with-arrow icon at the bottom of the screen."
            />
            <Step
              n={2}
              icon={<PlusSquare className="h-5 w-5 text-gold-accent" />}
              title='Choose "Add to Home Screen"'
              detail="Scroll down in the share sheet if you don't see it right away."
            />
            <Step
              n={3}
              icon={<Check className="h-5 w-5 text-gold-accent" />}
              title='Tap "Add"'
              detail="The Apex icon will appear on your Home Screen."
            />
            <p className="text-xs text-ivory/50 pt-1">
              Note: works in Safari only. Open this page in Safari if you're using Chrome on iOS.
            </p>
          </TabsContent>

          <TabsContent value="android" className="space-y-3 mt-4">
            {canInstall ? (
              <>
                <p className="text-sm text-ivory/80">
                  Your phone supports one-tap install. Tap the button below:
                </p>
                <Button
                  onClick={handleNativeInstall}
                  className="w-full bg-gold-accent text-black hover:bg-gold-accent/90 h-12 text-base font-medium"
                >
                  <Download className="h-5 w-5 mr-2" /> Install Now
                </Button>
                <p className="text-xs text-ivory/50 pt-1">
                  Or follow the manual steps below if the prompt doesn't appear.
                </p>
              </>
            ) : null}
            <Step
              n={1}
              icon={<MoreVertical className="h-5 w-5 text-gold-accent" />}
              title="Open Chrome's menu"
              detail="Tap the three-dot menu (⋮) in the top right of Chrome."
            />
            <Step
              n={2}
              icon={<Download className="h-5 w-5 text-gold-accent" />}
              title='Tap "Install app" or "Add to Home screen"'
              detail="Confirm to add Apex Golf Academy to your phone."
            />
          </TabsContent>

          <TabsContent value="desktop" className="space-y-4 mt-4">
            <p className="text-sm text-ivory/80">
              The home-screen install works on phones. Open this page on your phone — copy the link below
              and send it to yourself, or scan a QR code from the address bar.
            </p>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-ivory/70 break-all">
              https://margeagolfacademy.com
            </div>
            <Button
              onClick={handleCopyLink}
              variant="outline"
              className="w-full border-gold-accent text-gold-accent hover:bg-gold-accent/10 hover:text-gold-accent"
            >
              <Copy className="h-4 w-4 mr-2" /> Copy link
            </Button>
            {canInstall && (
              <Button
                onClick={handleNativeInstall}
                className="w-full bg-gold-accent text-black hover:bg-gold-accent/90"
              >
                <Download className="h-4 w-4 mr-2" /> Install on this computer
              </Button>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Step({
  n,
  icon,
  title,
  detail,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="flex flex-col items-center gap-1">
        <div className="h-7 w-7 rounded-full bg-green-accent/30 border border-green-accent/40 flex items-center justify-center text-xs font-semibold text-ivory">
          {n}
        </div>
        <div className="mt-1">{icon}</div>
      </div>
      <div className="flex-1">
        <div className="font-medium text-ivory text-sm">{title}</div>
        <div className="text-xs text-ivory/60 mt-0.5">{detail}</div>
      </div>
    </div>
  );
}