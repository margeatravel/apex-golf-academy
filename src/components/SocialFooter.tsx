import { Instagram, ShoppingBag } from 'lucide-react';

export function SocialFooter() {
  return (
    <footer className="border-t border-white/10 mt-12 pb-24 lg:pb-0">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col items-center gap-3">
          <p className="text-xs text-ivory/40">Follow us & shop golf products</p>
          <div className="flex flex-wrap justify-center gap-4">
            <a
              href="https://www.instagram.com/scgolfacademy"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-ivory/50 hover:text-gold-accent transition-colors"
            >
              <Instagram className="h-4 w-4" />
              <span>@scgolfacademy</span>
            </a>
            <a
              href="https://www.instagram.com/cancungolfproducts"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-ivory/50 hover:text-gold-accent transition-colors"
            >
              <ShoppingBag className="h-4 w-4" />
              <span>@cancungolfproducts</span>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
