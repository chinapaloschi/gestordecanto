import { IconInstagram, IconWhatsApp, IconTikTok, IconYouTube } from './Icons.jsx';

const SOCIAL_LINKS = {
  instagram: "https://www.instagram.com/estudiodecantosandrapaloschi/",
  whatsapp: "https://wa.me/5492216141254",
  tiktok: "https://www.tiktok.com/@estudiodecantosandrapalo/",
  youtube: "https://www.youtube.com/@EstudioDeCantoSandraPaloschi",
};

export const SocialMediaLinks = () => (
  <div className="mt-8 pt-6 border-t border-gray-200 text-center">
    <h4 className="font-display italic text-sm text-gray-700 mb-4">Seguinos en nuestras redes</h4>
    <div className="flex items-center justify-center gap-4">
      <a href={SOCIAL_LINKS.instagram} target="_blank" rel="noopener noreferrer" title="Instagram" className="p-3 rounded-full bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-600 transition-colors"><IconInstagram /></a>
      <a href={SOCIAL_LINKS.whatsapp} target="_blank" rel="noopener noreferrer" title="WhatsApp" className="p-3 rounded-full bg-rose-50 text-rose-500 hover:bg-green-100 hover:text-green-600 transition-colors"><IconWhatsApp /></a>
      <a href={SOCIAL_LINKS.tiktok} target="_blank" rel="noopener noreferrer" title="TikTok" className="p-3 rounded-full bg-rose-50 text-rose-500 hover:bg-gray-200 hover:text-black transition-colors"><IconTikTok /></a>
      <a href={SOCIAL_LINKS.youtube} target="_blank" rel="noopener noreferrer" title="YouTube" className="p-3 rounded-full bg-rose-50 text-rose-500 hover:bg-red-100 hover:text-red-600 transition-colors"><IconYouTube /></a>
    </div>
  </div>
);
