import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  getGetAdminDashboardQueryKey, getGetListingQueryKey, getGetMarketplaceSummaryQueryKey, getGetMyProfileQueryKey, getGetMySellerVerificationQueryKey,
  getGetTransactionDisputeQueryKey, getListAdminFlagsQueryKey, getListConversationOffersQueryKey,
  getListMyListingsQueryKey,
  getGetTransactionQueryKey, getListAdminDisputesQueryKey, getListAdminVerificationsQueryKey,
  getListConversationsQueryKey, getListListingsQueryKey, getListMessagesQueryKey,
  getListTransactionsQueryKey, useCheckPhoneVerification, useConfirmReceipt, useCreateListing,
  useFinalizeUpload, useGetTransactionDispute,
  useCreateOffer, useDeleteListing, useGetAdminDashboard, useGetListing, useGetMarketplaceSummary,
  useGetMyProfile, useGetMySellerVerification, useGetTransaction, useListAdminDisputes,
  useListAdminFlags, useListAdminVerifications, useListConversationOffers, useListConversations,
  useListListings, useListMessages, useListMyListings, useListTransactions, useMarkTransactionDelivered,
  useOpenDispute, useReportMarketplaceUser, useRequestUploadUrl, useResolveDispute, useRespondToDispute,
  useRespondToOffer, useReviewFlag, useReviewSellerVerification, useSaveMyProfile,
  useSendMessage, useStartConversation, useStartPhoneVerification, useSubmitSellerVerification, useUpdateListing,
} from '@workspace/api-client-react';
import type { Listing, ListingInput, ProfileInput } from '@workspace/api-client-react';
import {
  ArrowDownRight, ArrowLeft, ArrowRight, BadgeCheck, Check, ChevronDown, ChevronRight,
  CircleHelp, Compass, FileCheck2, Filter, ImagePlus, Leaf, MapPin, Menu,
  MessageCircle, PackageCheck, Plus, Search, ShieldCheck, SlidersHorizontal, Sparkles, Truck,
  Upload, WalletCards, X,
} from 'lucide-react';
import { Link, Redirect, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, retry: 1 } } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#245c43',
    colorForeground: '#18372e',
    colorMutedForeground: '#728077',
    colorDanger: '#b44336',
    colorBackground: '#fffdf7',
    colorInput: '#fffdf7',
    colorInputForeground: '#18372e',
    colorNeutral: '#dcded2',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '0.6rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffdf7] rounded-xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#18372e] font-bold',
    headerSubtitle: 'text-[#66766c]',
    socialButtonsBlockButtonText: 'text-[#18372e] font-semibold',
    formFieldLabel: 'text-[#314b3d] font-semibold',
    footerActionLink: 'text-[#245c43] font-semibold',
    footerActionText: 'text-[#66766c]',
    dividerText: 'text-[#728077]',
    identityPreviewEditButton: 'text-[#245c43] font-semibold',
    formFieldSuccessText: 'text-[#245c43]',
    alertText: 'text-[#8c382f]',
    logoBox: 'rounded-lg overflow-hidden',
    logoImage: 'object-contain',
    socialButtonsBlockButton: 'border-[#dcded2] bg-[#faf8f0] hover:bg-[#f0eee4]',
    formButtonPrimary: 'bg-[#245c43] hover:bg-[#1f503a] text-[#fffdf7]',
    formFieldInput: 'border-[#dcded2] bg-[#fffdf7] text-[#18372e]',
    footerAction: 'text-[#66766c]',
    dividerLine: 'bg-[#e3dfd1]',
    alert: 'border-[#e6c6bd] bg-[#fbefeb]',
    otpCodeFieldInput: 'border-[#dcded2] bg-[#fffdf7] text-[#18372e]',
    formFieldRow: 'text-[#18372e]',
    main: 'text-[#18372e]',
  },
};
const categories = ['Cattle', 'Goats', 'Sheep', 'Poultry', 'Fish', 'Other livestock'];
const states = ['All Nigeria', 'Lagos', 'Oyo', 'Kano', 'Kaduna', 'Ogun', 'Abuja', 'Plateau', 'Rivers'];
const categorySlug: Record<string, string> = { cattle: 'cattle', goats: 'goats', sheep: 'sheep', poultry: 'poultry', fish: 'fish', 'other livestock': 'other' };
const categoryImage: Record<string, string> = { cattle: '/cattle.jpg', goats: '/goats.jpg', sheep: '/sheep.jpg', poultry: '/poultry.jpg', fish: '/fish.jpg', other: '/other-livestock.jpg' };
const money = (v?: number) => `₦${(v ?? 0).toLocaleString('en-NG')}`;
const titleCase = (value = '') => value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const photoUrl = (path?: string) => path?.startsWith('/objects/') ? `/api/storage${path}` : path;

function Brand({ inverse = false }: { inverse?: boolean }) {
  return <Link href="/" className={`brand ${inverse ? 'brand-inverse' : ''}`} data-testid="link-home"><span className="brand-mark"><Leaf size={18} strokeWidth={2.5} /></span><span>naija<span className="brand-livestock">livestock</span></span></Link>;
}
function Header() {
  const [open, setOpen] = useState(false);
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  return <header className="topbar"><div className="topbar-inner"><Brand /><nav className={open ? 'main-nav nav-open' : 'main-nav'} aria-label="Main navigation">
    <Link href="/browse" data-testid="link-browse">Explore livestock</Link><Link href="/seller" data-testid="link-seller">Sell with us</Link><Link href="/messages" data-testid="link-messages">Messages</Link>
  </nav><div className="top-actions">{!isLoaded ? <span className="auth-nav-skeleton shimmer"/> : isSignedIn ? <><Link href="/account/setup" className="signin-link account-name" data-testid="link-account">{user?.firstName || 'My account'}</Link><button className="signin-link signout-link" onClick={() => signOut({ redirectUrl: basePath || '/' })} data-testid="button-sign-out">Sign out</button></> : <><Link href="/sign-in" className="signin-link" data-testid="link-sign-in">Sign in</Link><Link href="/sign-up" className="button button-dark button-small" data-testid="link-get-started">Get started <ArrowRight size={15}/></Link></>}<button className="icon-button mobile-menu" onClick={() => setOpen(!open)} aria-label="Open navigation" data-testid="button-menu">{open ? <X/> : <Menu/>}</button></div></div></header>;
}
function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <div className="app-shell"><Header /><ErrorBoundary resetKey={location}>{children}</ErrorBoundary><footer className="site-footer"><div className="footer-top"><Brand inverse/><p>Better livestock trade starts with trust.</p><div className="footer-links"><Link href="/browse">Browse</Link><Link href="/seller">Sell on NaijaLivestock</Link><Link href="/messages">Messages</Link></div></div><div className="footer-bottom"><span>© NaijaLivestock · Made for the way Nigeria trades.</span><span>Healthy animals. Straightforward deals.</span></div></footer></div>;
}
function LoadingCards() { return <div className="listing-grid">{[1, 2, 3, 4].map((n) => <div className="skeleton-card" key={n}><div className="skeleton-photo shimmer"/><div className="skeleton-lines"><i/><i/><i/></div></div>)}</div>; }
function ErrorPanel({ retry }: { retry: () => void }) { return <div className="state-panel"><span className="state-icon"><CircleHelp/></span><h3>We couldn’t load this just now.</h3><p>Your place is saved. Give it another try.</p><button onClick={retry} className="button button-outline" data-testid="button-retry">Try again <ArrowRight size={15}/></button></div>; }
function EmptyPanel({ title, detail }: { title: string; detail: string }) { return <div className="state-panel"><span className="state-icon"><Compass/></span><h3>{title}</h3><p>{detail}</p></div>; }
function ListingCard({ listing, index = 0 }: { listing: Listing; index?: number }) {
  const photo = photoUrl(listing.photos?.[0]) || categoryImage[listing.category] || '/goats.jpg';
  return <Link href={`/listing/${listing.id}`} className="listing-card" data-testid={`card-listing-${listing.id}`}><div className={`listing-photo photo-tone-${index % 4}`} style={{ backgroundImage: `url("${photo}")` }}><span className="photo-tag">{titleCase(listing.category)}</span>{listing.sample && <span className="sample-badge" data-testid={`badge-sample-${listing.id}`}>Sample listing</span>}{listing.featured && <span className="featured-tag"><Sparkles size={12}/> Featured</span>}</div><div className="listing-info"><div className="listing-name-row"><h3>{listing.breed}</h3><strong>{money(listing.priceNaira)}</strong></div><div className="listing-meta"><span><MapPin size={13}/>{listing.city}, {listing.state}</span><span>{listing.quantity} available</span></div><div className="seller-mini"><span className="seller-dot">{listing.seller.name?.slice(0,1)}</span><span>{listing.seller.name}</span>{listing.seller.verified && <BadgeCheck size={14} className="verified-icon"/>}<span className="health-chip">{titleCase(listing.healthStatus)}</span></div></div></Link>;
}
function Home() {
  const summary = useGetMarketplaceSummary();
  const featured = summary.data?.featuredListings ?? [];
  return <Shell><main>
    <section className="hero"><div className="hero-image"></div><div className="hero-shade"></div><div className="hero-content wrap"><div className="eyebrow light-eyebrow"><span className="eyebrow-line"/>A better way to trade livestock</div><h1>Buy and Sell Livestock Across Nigeria, Trusted and Easy</h1><p>Meet approved farms, find healthy animals, and make your next move with confidence.</p><div className="hero-actions"><Link href="/browse" className="button button-cream" data-testid="link-buy"><Search size={17}/> I want to buy <ArrowRight size={16}/></Link><Link href="/account/setup?role=seller" className="button button-ghost" data-testid="link-sell">I want to sell <ArrowDownRight size={16}/></Link></div><div className="hero-proof"><div className="proof-avatars"><i>AK</i><i>TA</i><i>MO</i><i>+</i></div><span>Local farms. Real people. Better trade.</span></div></div><div className="hero-caption"><span>01 / 06</span><span>Built around how Nigeria buys</span><span className="caption-line"/></div></section>
    <section className="trust-strip wrap"><div className="trust-intro"><span className="eyebrow">Trade with clarity</span><h2>Good livestock.<br/>Good people.</h2></div><div className="trust-item"><span className="trust-icon"><ShieldCheck/></span><div><strong>{summary.data?.verifiedSellers?.toLocaleString() ?? '—'}</strong><span>approved sellers</span></div></div><div className="trust-item"><span className="trust-icon"><PackageCheck/></span><div><strong>{summary.data?.activeListings?.toLocaleString() ?? '—'}</strong><span>animals listed</span></div></div><div className="trust-note"><span className="tiny-rule"/><p>Clear details before you travel. Direct conversations with the people who raise them.</p></div></section>
    <section className="category-section wrap"><div className="section-heading"><div><span className="eyebrow">Start with what you need</span><h2>Find your kind of livestock.</h2></div><Link href="/browse" className="text-link">Browse all animals <ArrowRight size={16}/></Link></div><div className="category-grid">{categories.map((category, i) => { const sl = categorySlug[category.toLowerCase()]; const img = categoryImage[sl] || '/other-livestock.jpg'; return <Link href={`/browse?category=${sl}`} className={`category-card cat-${i}`} key={category} data-testid={`category-${sl}`}><div className="category-image" style={{ backgroundImage: `url("${img}")` }}/><div className="category-overlay"/><div className="category-content"><span className="category-number">0{i + 1}</span><h3>{category}</h3><span className="category-arrow"><ArrowRight size={17}/></span></div></Link>; })}</div></section>
    <section className="featured-section"><div className="wrap"><div className="section-heading"><div><span className="eyebrow">Picked for you</span><h2>Listings worth a closer look.</h2></div><Link href="/browse" className="text-link">See everything <ArrowRight size={16}/></Link></div>{summary.isLoading ? <LoadingCards/> : summary.isError ? <ErrorPanel retry={() => summary.refetch()}/> : featured.length ? <div className="listing-grid">{featured.slice(0, 4).map((l, i) => <ListingCard key={l.id} listing={l} index={i}/>)}</div> : <EmptyPanel title="Fresh listings are on their way." detail="Browse all livestock to find what local farms are offering today."/>}</div></section>
    <section className="how-section wrap"><div className="how-art"><div className="how-image"/><div className="art-stamp"><ShieldCheck size={21}/><span>Trust,<br/>from the start.</span></div><div className="art-caption">FROM FARM TO YOUR NEXT MOVE</div></div><div className="how-copy"><span className="eyebrow">Simple by design</span><h2>From first look to a better deal.</h2><p>Know who you’re talking to, get the details that matter, and agree directly with a seller who knows their animals.</p><ol className="steps"><li><span>01</span><div><b>Choose your animals</b><small>Browse by kind, then narrow by location.</small></div></li><li><span>02</span><div><b>Talk to the farm</b><small>Ask questions and make an offer that works.</small></div></li><li><span>03</span><div><b>Agree the next step</b><small>Pickup or delivery, discussed directly.</small></div></li></ol><Link href="/browse" className="button button-dark">Start browsing <ArrowRight size={16}/></Link></div></section>
    <section className="seller-cta"><div className="wrap seller-cta-inner"><div><span className="eyebrow light-eyebrow">For farms and independent sellers</span><h2>Your animals deserve<br/>the right buyers.</h2><p>Put your farm in front of buyers looking for healthy livestock across Nigeria.</p><Link href="/account/setup?role=seller" className="button button-cream">I want to sell <ArrowRight size={16}/></Link></div><div className="seller-cta-stats"><div><b>01</b><span>Set up your seller profile</span></div><div><b>02</b><span>Submit details for review</span></div><div><b>03</b><span>List when approved</span></div></div></div></section>
  </main></Shell>;
}
function Browse() {
  const params = new URLSearchParams(window.location.search);
  const [category, setCategory] = useState(params.get('category') || '');
  const [location, setLocation] = useState('');
  const [query, setQuery] = useState('');
  const queryParams = useMemo(() => ({ ...(category ? { category: category as Listing['category'] } : {}), ...(location ? { location } : {}), ...(query ? { q: query } : {}) }), [category, location, query]);
  const listings = useListListings(queryParams, { query: { queryKey: getListListingsQueryKey(queryParams) } });
  const rows = listings.data?.listings ?? [];
  return <Shell><main className="browse-page wrap"><div className="crumb"><Link href="/">Home</Link><ChevronRight size={14}/> Browse livestock</div><div className="browse-title"><div><span className="eyebrow">The marketplace</span><h1>Find the right animals.</h1><p>Browse healthy livestock from farms and sellers across Nigeria.</p></div><div className="result-total">{listings.data?.total ?? '—'}<span>listings</span></div></div>
    <div className="browse-filter"><label className="search-box"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search breed or animal" aria-label="Search listings" data-testid="input-search-listings"/></label><label className="filter-select"><MapPin size={17}/><select value={location} onChange={e => setLocation(e.target.value)} aria-label="Filter by state or city" data-testid="select-location"><option value="">All Nigeria · State or city</option>{states.slice(1).map(s => <option key={s} value={s}>{s}</option>)}</select><ChevronDown size={15}/></label><button className="button button-outline filter-button" onClick={() => { setCategory(''); setLocation(''); setQuery(''); }} data-testid="button-clear-filters"><SlidersHorizontal size={16}/> Clear</button></div>
    <div className="browse-categories"><button onClick={() => setCategory('')} className={!category ? 'category-pill selected' : 'category-pill'} data-testid="filter-all">All livestock</button>{categories.map(c => { const value = categorySlug[c.toLowerCase()]; return <button key={c} onClick={() => setCategory(value)} className={category === value ? 'category-pill selected' : 'category-pill'} data-testid={`filter-${value}`}>{c}</button>; })}</div>
    <div className="browse-results-head"><span>{rows.length ? `Showing ${rows.length} of ${listings.data?.total}` : 'Explore the latest listings'}</span><span><Filter size={15}/> Sorted by newest</span></div>
    {listings.isLoading ? <LoadingCards/> : listings.isError ? <ErrorPanel retry={() => listings.refetch()}/> : rows.length ? <div className="listing-grid">{rows.map((l, i) => <ListingCard key={l.id} listing={l} index={i}/>)}</div> : <EmptyPanel title="No animals match that search." detail="Try another location or clear a filter to see more listings."/>}
  </main></Shell>;
}
function ListingDetail() {
  const { listingId = '' } = useParams<{ listingId: string }>();
  const listingQuery = useGetListing(listingId, { query: { queryKey: getGetListingQueryKey(listingId), enabled: !!listingId } });
  const startConversation = useStartConversation();
  const createOffer = useCreateOffer();
  const reportUser = useReportMarketplaceUser();
  const [offerOpen, setOfferOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<'stolen_photos'|'duplicate_listing'|'unsafe_animals'|'buyer_misconduct'|'seller_misconduct'|'other'>('other');
  const [reportDetails, setReportDetails] = useState('');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notice, setNotice] = useState('');
  const listing = listingQuery.data;
  const createConversation = () => { if (!listing || listing.sample) return; startConversation.mutate({ data: { listingId: listing.id, message: 'Hello, I’m interested in this listing. Is it still available?' } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() }); setNotice('Your message was sent. Find the conversation in Messages.'); }, onError: () => setNotice('We couldn’t start a conversation. Please sign in and try again.') }); };
  const submitOffer = () => {
    if (!listing || listing.sample || !amount) return;
    startConversation.mutate({ data: { listingId: listing.id, message: `I’d like to make an offer of ₦${Number(amount).toLocaleString('en-NG')} for ${quantity} animal${Number(quantity) === 1 ? '' : 's'}.` } }, {
      onSuccess: conversation => {
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        createOffer.mutate({ conversationId: conversation.id, data: { amountNaira: Number(amount), quantity: Number(quantity) } }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conversation.id) });
            queryClient.invalidateQueries({ queryKey: getListConversationOffersQueryKey(conversation.id) });
            setNotice('Your offer was sent to the seller.');
            setOfferOpen(false);
          },
          onError: () => setNotice('Your conversation started, but the offer could not be sent. You can continue in Messages.'),
        });
      },
      onError: () => setNotice('We couldn’t start a conversation. Please sign in and try again.'),
    });
  };
  const submitReport = () => {
    if (!listing || reportDetails.trim().length < 10) return;
    reportUser.mutate({ data: { reportedUserId: listing.seller.id, listingId: listing.id, reason: reportReason, details: reportDetails.trim() } }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListAdminFlagsQueryKey() }); setNotice('Report submitted to the marketplace safety team.'); setReportOpen(false); setReportDetails(''); },
      onError: () => setNotice('Your report could not be submitted. Please sign in and try again.'),
    });
  };
  return <Shell><main className="detail-page wrap"><div className="crumb"><Link href="/browse">Browse livestock</Link><ChevronRight size={14}/><span>{listing ? listing.breed : 'Listing details'}</span></div>{listingQuery.isLoading ? <div className="detail-skeleton shimmer"/> : listingQuery.isError || !listing ? <ErrorPanel retry={() => listingQuery.refetch()}/> : <><div className="detail-layout"><div className="detail-gallery"><div className="detail-main-photo" style={{ backgroundImage: `url("${photoUrl(listing.photos?.[0]) || categoryImage[listing.category] || '/goats.jpg'}")` }}><span className="photo-tag">{titleCase(listing.category)}</span>{listing.sample && <span className="sample-badge detail-sample-badge" data-testid={`badge-sample-detail-${listing.id}`}>Sample listing</span>}</div><div className="detail-photo-note"><ImagePlus size={15}/>{listing.photos?.length ?? 0} farm photos</div></div><div className="detail-summary"><div className="eyebrow">Farm listing <span className="green-dot"/></div><h1>{listing.breed}</h1><div className="detail-place"><MapPin size={16}/>{listing.city}, {listing.state}</div><div className="detail-price">{money(listing.priceNaira)}<span> per animal</span></div><div className="detail-rule"/><div className="animal-stats"><div><small>Available</small><b>{listing.quantity} animals</b></div><div><small>Age</small><b>{listing.ageMonths} months</b></div><div><small>Weight</small><b>{listing.weightKg} kg</b></div><div><small>Health</small><b>{titleCase(listing.healthStatus)}</b></div></div><div className="detail-actions"><button className="button button-dark full-button" disabled={listing.sample || startConversation.isPending} onClick={createConversation} data-testid="button-message-seller"><MessageCircle size={17}/>{listing.sample ? 'Messaging unavailable' : startConversation.isPending ? 'Opening conversation…' : 'Message Seller'}</button><button className="button button-outline full-button" disabled={listing.sample} onClick={() => setOfferOpen(!offerOpen)} data-testid="button-make-offer">{listing.sample ? 'Offers unavailable' : 'Make Offer'} {!listing.sample && <ArrowRight size={16}/>}</button></div>{listing.sample && <div className="sample-disclosure" role="note">Preview only. This is a synthetic sample listing; its seller cannot be contacted and offers are disabled.</div>}{notice && <div className="inline-note" role="status">{notice}</div>}{offerOpen && <div className="offer-box"><div className="offer-fields"><label>Offer per animal<input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="₦ Amount" data-testid="input-offer-amount"/></label><label>Quantity<input type="number" min="1" max={listing.quantity} value={quantity} onChange={e => setQuantity(e.target.value)} data-testid="input-offer-quantity"/></label></div><button className="button button-accent full-button" onClick={submitOffer} disabled={!amount || Number(amount) < 1 || Number(quantity) < 1 || Number(quantity) > listing.quantity || startConversation.isPending || createOffer.isPending} data-testid="button-send-offer">{createOffer.isPending ? 'Sending offer…' : 'Send offer'} <ArrowRight size={15}/></button><small>An offer is sent to the seller. No payment is taken here.</small></div>}<div className="seller-card"><div className="seller-avatar">{listing.seller.name?.slice(0,1)}</div><div><b>{listing.seller.name}</b><span><MapPin size={12}/>{listing.seller.location}</span></div>{listing.seller.verified && <span className="approved-badge"><BadgeCheck size={14}/> Approved</span>}</div><button className="text-link report-link" onClick={() => setReportOpen(!reportOpen)} data-testid="button-report-seller">Report listing or seller</button>{reportOpen && <div className="report-box"><b>Tell us what needs attention.</b><label>Reason<select value={reportReason} onChange={e => setReportReason(e.target.value as typeof reportReason)} data-testid="select-report-reason"><option value="stolen_photos">Stolen photos</option><option value="duplicate_listing">Duplicate listing</option><option value="unsafe_animals">Animal safety concern</option><option value="seller_misconduct">Seller misconduct</option><option value="other">Other</option></select></label><label>Details<textarea value={reportDetails} onChange={e => setReportDetails(e.target.value)} minLength={10} maxLength={2000} placeholder="Describe your concern (at least 10 characters)" data-testid="input-report-details"/></label><button className="button button-dark full-button" disabled={reportDetails.trim().length < 10 || reportUser.isPending} onClick={submitReport} data-testid="button-submit-report">{reportUser.isPending ? 'Submitting report…' : 'Submit report'}</button></div>}</div></div><section className="listing-description"><div><span className="eyebrow">A few details</span><h2>Know what you’re getting.</h2></div><p>Healthy {listing.breed.toLowerCase()} available from {listing.city}. The seller can answer questions about care, transport, and availability directly in Messages.</p><div className="fulfillment-info"><Truck size={17}/><span>Fulfillment: <b>{titleCase(listing.fulfillment)}</b></span><span className="health-chip">{titleCase(listing.healthStatus)}</span></div></section></>}</main></Shell>;
}
function Setup() {
  const profile = useGetMyProfile();
  const saveProfile = useSaveMyProfile();
  const startPhone = useStartPhoneVerification();
  const checkPhone = useCheckPhoneVerification();
  const params = new URLSearchParams(window.location.search);
  const [role, setRole] = useState<'buyer'|'seller'>(params.get('role') === 'seller' ? 'seller' : 'buyer');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState(0);
  const [notice, setNotice] = useState('');
  const onSave = () => { const data: ProfileInput = { role, displayName: name, phone, state, city }; saveProfile.mutate({ data }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() }); setStep(1); setNotice('Profile saved. Phone verification is required to continue.'); }, onError: () => setNotice('Profile could not be saved. Sign in first, then try again.') }); };
  const sendCode = () => startPhone.mutate({ data: { phone } }, { onSuccess: res => setNotice(res.message || `Phone verification status: ${res.status}.`), onError: () => setNotice('Phone verification provider is not configured. Your phone has not been verified.') });
  const verifyCode = () => checkPhone.mutate({ data: { phone, code } }, { onSuccess: res => { setNotice(res.message); if (res.status === 'approved') { queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() }); setStep(2); } }, onError: () => setNotice('Phone verification provider is not configured. No verification was recorded.') });
  return <Shell><main className="form-page wrap"><div className="form-intro"><span className="eyebrow">Your NaijaLivestock account</span><h1>Let’s get you set up.</h1><p>A few details help buyers and sellers make better connections.</p></div><div className="setup-card"><div className="progress-row">{['Your profile', 'Phone check', 'Next steps'].map((s, i) => <div key={s} className={step >= i ? 'progress-step active' : 'progress-step'}><span>{step > i ? <Check size={14}/> : `0${i + 1}`}</span>{s}</div>)}</div>{step === 0 && <div className="form-fields"><h2>First, what brings you here?</h2><div className="role-options"><button onClick={() => setRole('buyer')} className={role === 'buyer' ? 'role-choice chosen' : 'role-choice'} data-testid="role-buyer"><Search/><b>I’m here to buy</b><span>Find healthy livestock from trusted farms.</span></button><button onClick={() => setRole('seller')} className={role === 'seller' ? 'role-choice chosen' : 'role-choice'} data-testid="role-seller"><Leaf/><b>I’m here to sell</b><span>Connect your farm with serious buyers.</span></button></div><label>Your name<input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" data-testid="input-display-name"/></label><label>Phone number<input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234 800 000 0000" data-testid="input-phone"/></label><div className="field-pair"><label>State<select value={state} onChange={e => setState(e.target.value)} data-testid="select-state"><option value="">Select state</option>{states.slice(1).map(s => <option key={s}>{s}</option>)}</select></label><label>City<input value={city} onChange={e => setCity(e.target.value)} placeholder="Your city" data-testid="input-city"/></label></div><button className="button button-dark full-button" disabled={saveProfile.isPending || !name || !phone || !state || !city} onClick={onSave} data-testid="button-save-profile">{saveProfile.isPending ? 'Saving…' : 'Continue'} <ArrowRight size={16}/></button></div>}{step === 1 && <div className="form-fields"><span className="state-icon"><ShieldCheck/></span><h2>Verify your phone number.</h2><p>Phone verification is a separate marketplace safety check. We’ll show its actual provider status here.</p><button className="button button-dark full-button" onClick={sendCode} disabled={startPhone.isPending} data-testid="button-send-code">{startPhone.isPending ? 'Checking provider…' : 'Send verification code'} <ArrowRight size={16}/></button><label>Verification code<input value={code} onChange={e => setCode(e.target.value)} placeholder="Enter code" data-testid="input-verification-code"/></label><button className="button button-outline full-button" onClick={verifyCode} disabled={!code || checkPhone.isPending} data-testid="button-check-code">Check code <Check size={16}/></button>{role === 'seller' && <div className="pilot-note" style={{ marginTop: '1rem', padding: '0.85rem', background: '#f4f6f0', borderRadius: '8px', fontSize: '0.85rem', border: '1px solid #dcded2' }}><b>🌾 Pilot Farm Program (First 50 Farms)</b><p style={{ margin: '0.35rem 0' }}>Are you one of our 50 pilot farms? You can skip ahead and submit your farm identity documents directly for manual review and approval by our founders (Ike Okuzu &amp; Mbaja Chizoba).</p><Link href="/seller/verification" className="button button-outline button-small" style={{ marginTop: '0.4rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>Skip to Seller Verification <ArrowRight size={14}/></Link></div>}</div>}{step === 2 && <div className="form-fields"><span className="state-icon"><Check/></span><h2>Profile saved.</h2><p>Your phone is confirmed by the verification provider. {role === 'seller' ? 'Seller verification is still a separate review before you can publish listings.' : 'You can now explore the marketplace.'}</p><Link className="button button-dark full-button" href={role === 'seller' ? '/seller' : '/browse'}>{role === 'seller' ? 'Continue to seller setup' : 'Browse livestock'} <ArrowRight size={16}/></Link></div>}{notice && <div className="inline-note" role="status">{notice}</div>}{profile.isError && <p className="subtle-note">Sign in to save a profile. Your profile has not been changed.</p>}</div></main></Shell>;
}
function Seller() {
  const verification = useGetMySellerVerification();
  const listings = useListMyListings();
  const deleteListing = useDeleteListing();
  const updateListing = useUpdateListing();
  const [notice, setNotice] = useState('');
  const ownListings = listings.data?.listings ?? [];
  const refreshListings = () => {
    queryClient.invalidateQueries({ queryKey: getListMyListingsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListListingsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetMarketplaceSummaryQueryKey() });
  };
  const archive = (item: Listing) => { if (window.confirm(`Archive ${item.breed}?`)) deleteListing.mutate({ listingId: item.id }, { onSuccess: () => { refreshListings(); setNotice('Listing archived.'); }, onError: () => setNotice('Could not archive this listing.') }); };
  const markSold = (item: Listing) => { if (window.confirm(`Mark ${item.breed} as sold?`)) updateListing.mutate({ listingId: item.id, data: { status: 'sold' } }, { onSuccess: () => { refreshListings(); setNotice('Listing marked as sold.'); }, onError: () => setNotice('Could not update this listing.') }); };
  const status = verification.data?.status ?? 'not_started';
  return <Shell><main className="dashboard-page wrap"><div className="dashboard-heading"><div><span className="eyebrow">Seller workspace</span><h1>Your farm, in good company.</h1><p>Manage your listings and seller review in one place.</p></div><Link href="/seller/listings/new" className="button button-dark"><Plus size={16}/> New listing</Link></div><div className={`verification-banner verify-${status}`}><span className="verify-icon"><FileCheck2/></span><div><span className="eyebrow">Seller verification</span><h2>{titleCase(status)}</h2><p>{status === 'approved' ? 'Your seller profile is approved. Keep your details current.' : status === 'pending' ? 'Your documents are with our review team. You can check back here for an update.' : 'Seller approval is required before your listings can be published.'}</p></div>{status !== 'approved' && <Link href="/seller/verification" className="button button-outline">{status === 'pending' ? 'View submission' : 'Start verification'} <ArrowRight size={15}/></Link>}</div><div className="dashboard-section-title"><div><span className="eyebrow">Your catalogue</span><h2>Listings <span className="counter">{ownListings.length}</span></h2></div><Link href="/seller/listings/new" className="text-link">Add a listing <ArrowRight size={15}/></Link></div>{listings.isLoading ? <LoadingCards/> : listings.isError ? <ErrorPanel retry={() => listings.refetch()}/> : ownListings.length ? <div className="seller-list-table">{ownListings.map(item => <div className="seller-list-row" key={item.id}><img src={photoUrl(item.photos?.[0]) || categoryImage[item.category] || '/goats.jpg'} alt="" /><div className="seller-list-name"><b>{item.breed}</b><span>{item.city}, {item.state} · {item.quantity} available</span></div><strong>{money(item.priceNaira)}</strong><span className="status-tag">{titleCase(item.status)}</span><Link href={`/listing/${item.id}`} className="text-link">View</Link>{item.status === 'active' && <button className="button button-outline button-small" disabled={updateListing.isPending} onClick={() => markSold(item)} data-testid={`button-mark-sold-${item.id}`}>Mark sold</button>}<button className="button button-outline button-small" disabled={deleteListing.isPending} onClick={() => archive(item)} data-testid={`button-archive-${item.id}`}>Archive</button></div>)}</div> : <EmptyPanel title="Your listings will live here." detail="Seller approval is required before listings can go live. Start with verification, then add your animals."/>}{notice && <div className="inline-note">{notice}</div>}</main></Shell>;
}
function SellerVerification() {
  const profile = useGetMyProfile();
  const verification = useGetMySellerVerification();
  const submit = useSubmitSellerVerification();
  const requestUpload = useRequestUploadUrl();
  const finalizeUpload = useFinalizeUpload();
  const [legalName, setLegalName] = useState('');
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [idType, setIdType] = useState<'nin'|'voters_card'|'drivers_license'|'passport'>('nin');
  const [documentPath, setDocumentPath] = useState('');
  const [notice, setNotice] = useState('');
  const handleFile = async (file?: File) => {
    if (!file) return;
    const contentType = file.type as 'image/jpeg'|'image/png'|'image/webp'|'application/pdf';
    requestUpload.mutate({ data: { name: file.name, size: file.size, contentType, purpose: 'identity_document' } }, {
      onSuccess: async res => {
        try {
          const upload = await fetch(res.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
          if (!upload.ok) throw new Error();
          finalizeUpload.mutate({ data: { objectPath: res.objectPath, purpose: 'identity_document' } }, {
            onSuccess: finalized => { setDocumentPath(finalized.objectPath); setNotice('Document uploaded and finalized.'); },
            onError: () => setNotice('Upload reached storage, but finalization failed. It is not attached to your application.'),
          });
        } catch { setNotice('Upload did not complete. Please choose the file again.'); }
      },
      onError: () => setNotice('Document upload is unavailable. No document was saved.'),
    });
  };
  const submitForReview = () => submit.mutate({ data: { legalName, state, city, idType, documentPath } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetMySellerVerificationQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetMyProfileQueryKey() }); setNotice('Your seller verification was submitted for review.'); }, onError: () => setNotice('Could not submit verification. Phone verification and seller eligibility may be required.') });
  return <Shell><main className="form-page wrap"><div className="crumb"><Link href="/seller">Seller workspace</Link><ChevronRight size={14}/> Verification</div><div className="form-intro"><span className="eyebrow">Seller verification</span><h1>Show buyers who you are.</h1><p>Our review team checks seller details before livestock can be listed publicly.</p></div><div className="setup-card verification-form"><div className="verification-current"><FileCheck2/><div><b>Current status: {titleCase(verification.data?.status ?? profile.data?.sellerVerification ?? 'not_started')}</b><span>{verification.data?.reviewNote || 'Submitted information is reviewed by the NaijaLivestock team.'}</span></div></div><div className="form-fields"><label>Legal name<input value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="Name on your identity document" data-testid="input-legal-name"/></label><div className="field-pair"><label>State<select value={state} onChange={e => setState(e.target.value)}><option value="">Select state</option>{states.slice(1).map(s => <option key={s}>{s}</option>)}</select></label><label>City<input value={city} onChange={e => setCity(e.target.value)} placeholder="Farm location"/></label></div><label>Identity document<select value={idType} onChange={e => setIdType(e.target.value as typeof idType)}><option value="nin">National Identification Number</option><option value="voters_card">Voter’s card</option><option value="drivers_license">Driver’s licence</option><option value="passport">International passport</option></select></label><label className="upload-field"><span><Upload size={17}/>{documentPath ? 'Document uploaded' : requestUpload.isPending || finalizeUpload.isPending ? 'Uploading and finalizing…' : 'Upload an identity document'}<small>PDF, JPEG, PNG, or WEBP</small></span><input type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={e => handleFile(e.target.files?.[0])} data-testid="input-identity-document"/></label><button className="button button-dark full-button" onClick={submitForReview} disabled={!legalName || !state || !city || !documentPath || submit.isPending || verification.data?.status === 'approved'} data-testid="button-submit-verification">{submit.isPending ? 'Submitting…' : 'Submit for review'} <ArrowRight size={16}/></button></div>{notice && <div className="inline-note">{notice}</div>}</div></main></Shell>;
}
function NewListing() {
  const [, setLocation] = useLocation();
  const create = useCreateListing();
  const requestUpload = useRequestUploadUrl();
  const finalizeUpload = useFinalizeUpload();
  const [form, setForm] = useState<ListingInput>({ category: 'cattle', breed: '', ageMonths: 0, weightKg: 0, healthStatus: 'healthy', priceNaira: 1, quantity: 1, state: '', city: '', fulfillment: 'both', photos: [] });
  const [notice, setNotice] = useState('');
  const update = (key: keyof ListingInput, value: string | number) => setForm(prev => ({ ...prev, [key]: value }));
  const upload = (file?: File) => {
    if (!file) return;
    requestUpload.mutate({ data: { name: file.name, size: file.size, contentType: file.type as 'image/jpeg'|'image/png'|'image/webp', purpose: 'listing_photo' } }, {
      onSuccess: async response => {
        try {
          const result = await fetch(response.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
          if (!result.ok) throw new Error();
          finalizeUpload.mutate({ data: { objectPath: response.objectPath, purpose: 'listing_photo' } }, {
            onSuccess: finalized => { setForm(prev => ({ ...prev, photos: [...prev.photos, finalized.objectPath].slice(0, 8) })); setNotice('Photo uploaded and finalized.'); },
            onError: () => setNotice('Upload reached storage, but finalization failed. This photo is not attached to the listing.'),
          });
        } catch { setNotice('Photo upload did not complete. Please try again.'); }
      },
      onError: () => setNotice('Photo upload is currently unavailable.'),
    });
  };
  const publish = () => create.mutate({ data: form }, { onSuccess: item => { queryClient.invalidateQueries({ queryKey: getListListingsQueryKey() }); queryClient.invalidateQueries({ queryKey: getListMyListingsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetMarketplaceSummaryQueryKey() }); setLocation(`/listing/${item.id}`); }, onError: () => setNotice('Your listing was not created. Seller approval is required before publishing.') });
  return <Shell><main className="form-page wrap"><div className="crumb"><Link href="/seller">Seller workspace</Link><ChevronRight size={14}/> New listing</div><div className="form-intro"><span className="eyebrow">Seller workspace · New listing</span><h1>Tell buyers about your animals.</h1><p>Clear details make it easier for the right buyer to reach you.</p></div><div className="listing-form-layout"><div className="setup-card"><div className="form-fields"><h2>Animal details</h2><label>Animal category<select value={form.category} onChange={e => update('category', e.target.value)}>{Object.values(categorySlug).map(v => <option key={v} value={v}>{titleCase(v)}</option>)}</select></label><label>Breed or type<input value={form.breed} onChange={e => update('breed', e.target.value)} placeholder="e.g. Sokoto Gudali" data-testid="input-breed"/></label><div className="field-pair"><label>Age in months<input type="number" min="0" value={form.ageMonths || ''} onChange={e => update('ageMonths', Number(e.target.value))}/></label><label>Weight in kg<input type="number" min="0" value={form.weightKg || ''} onChange={e => update('weightKg', Number(e.target.value))}/></label></div><div className="field-pair"><label>Price per animal (₦)<input type="number" min="1" value={form.priceNaira || ''} onChange={e => update('priceNaira', Number(e.target.value))}/></label><label>Number available<input type="number" min="1" value={form.quantity} onChange={e => update('quantity', Number(e.target.value))}/></label></div><label>Health status<select value={form.healthStatus} onChange={e => update('healthStatus', e.target.value)}><option value="healthy">Healthy</option><option value="vaccinated">Vaccinated</option><option value="needs_checkup">Needs checkup</option></select></label><div className="field-pair"><label>State<select value={form.state} onChange={e => update('state', e.target.value)}><option value="">Select state</option>{states.slice(1).map(s => <option key={s}>{s}</option>)}</select></label><label>City<input value={form.city} onChange={e => update('city', e.target.value)} placeholder="City or town"/></label></div><label>Fulfilment<select value={form.fulfillment} onChange={e => update('fulfillment', e.target.value)}><option value="both">Pickup or delivery</option><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select></label><label className="upload-field"><span><ImagePlus size={17}/>{form.photos.length ? `${form.photos.length} photo${form.photos.length === 1 ? '' : 's'} added` : 'Add listing photos'}<small>At least one photo · Up to 8</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => upload(e.target.files?.[0])}/></label>{form.photos.length > 0 && <div className="photo-paths">{form.photos.map((p, i) => <span key={p}>Photo {i + 1} <button onClick={() => setForm(prev => ({ ...prev, photos: prev.photos.filter(x => x !== p) }))} aria-label="Remove photo"><X size={13}/></button></span>)}</div>}<button className="button button-dark full-button" onClick={publish} disabled={create.isPending || !form.breed || !form.state || !form.city || form.photos.length === 0} data-testid="button-create-listing">{create.isPending ? 'Creating listing…' : 'Create listing'} <ArrowRight size={16}/></button>{notice && <div className="inline-note">{notice}</div>}</div></div><aside className="form-aside"><span className="aside-icon"><ShieldCheck/></span><h3>Only approved sellers can publish.</h3><p>Listings are created through the marketplace. If your seller review is pending, your listing will not be published yet.</p><Link href="/seller/verification" className="text-link">Check seller status <ArrowRight size={15}/></Link></aside></div></main></Shell>;
}
function Messages() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const conversations = useListConversations();
  const messages = useListMessages(conversationId || '', { query: { queryKey: getListMessagesQueryKey(conversationId || ''), enabled: !!conversationId } });
  const offers = useListConversationOffers(conversationId || '', { query: { queryKey: getListConversationOffersQueryKey(conversationId || ''), enabled: !!conversationId } });
  const profile = useGetMyProfile();
  const send = useSendMessage();
  const respondToOffer = useRespondToOffer();
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const [offerNotice, setOfferNotice] = useState('');
  const sendMessage = () => { if (!conversationId || !text.trim()) return; send.mutate({ conversationId, data: { text: text.trim() } }, { onSuccess: () => { setText(''); queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conversationId) }); queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() }); }, onError: () => setNotice('Message could not be sent. Please sign in and try again.') }); };
  const answerOffer = (offerId: string, status: 'accepted'|'declined') => respondToOffer.mutate({ offerId, data: { status } }, {
    onSuccess: offer => {
      queryClient.invalidateQueries({ queryKey: getListConversationOffersQueryKey(offer.conversationId) });
      queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(offer.conversationId) });
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      setOfferNotice(`Offer ${status}.`);
    },
    onError: () => setOfferNotice('The response could not be saved. No offer status was changed.'),
  });
  return <Shell><main className="messages-page wrap"><div className="dashboard-heading"><div><span className="eyebrow">Direct conversations</span><h1>Messages</h1><p>Talk directly with the people behind each listing.</p></div></div><div className="message-layout"><aside className="conversation-list"><div className="conversation-head">Your conversations <span>{conversations.data?.length ?? 0}</span></div>{conversations.isLoading ? [1,2,3].map(n => <div className="conversation-skeleton shimmer" key={n}/>) : conversations.isError ? <ErrorPanel retry={() => conversations.refetch()}/> : conversations.data?.length ? conversations.data.map(c => <Link href={`/messages/${c.id}`} key={c.id} className={`conversation-row ${conversationId === c.id ? 'conversation-active' : ''}`} data-testid={`conversation-${c.id}`}><span className="seller-avatar"><MessageCircle size={17}/></span><span className="conversation-copy"><b>{c.otherParticipantName}</b><small>{c.listingBreed}</small><span>{c.lastMessage}</span></span>{!!c.unreadCount && <i>{c.unreadCount}</i>}</Link>) : <div className="small-empty">No conversations yet. Start by messaging a seller from a listing.</div>}</aside><section className="chat-panel">{conversationId ? <><div className="chat-head"><span className="seller-avatar"><MessageCircle size={16}/></span><div><b>Conversation</b><span>Discuss listing details directly</span></div></div><div className="chat-body">{messages.isLoading ? <div className="chat-loading"><i/><i/><i/></div> : messages.isError ? <ErrorPanel retry={() => messages.refetch()}/> : messages.data?.length ? messages.data.map(m => <div className="message-bubble" key={m.id}><p>{m.text}</p><small>{new Date(m.createdAt).toLocaleString()}</small></div>) : <EmptyPanel title="Say hello." detail="Ask about animal health, availability, or pickup."/>}</div>{offers.isLoading ? <div className="offer-state shimmer"/> : offers.isError ? <div className="offer-response-panel"><p>Offers could not be loaded.</p><button className="text-link" onClick={() => offers.refetch()}>Try again</button></div> : !!offers.data?.length && <div className="offer-response-panel"><div className="offer-response-heading"><b>Offers in this conversation</b><span>{offers.data.length}</span></div>{offers.data.map(offer => <div className="received-offer" key={offer.id}><div><small>Offer per animal · quantity {offer.quantity}</small><b>{money(offer.amountNaira)}</b><span className={`status-tag offer-status-${offer.status}`}>{titleCase(offer.status)}</span></div>{profile.data?.role === 'seller' && offer.status === 'pending' && offer.buyerId !== profile.data.userId && <div className="queue-actions"><button className="button button-dark button-small" disabled={respondToOffer.isPending} onClick={() => answerOffer(offer.id, 'accepted')} data-testid={`button-accept-offer-${offer.id}`}>Accept</button><button className="button button-outline button-small" disabled={respondToOffer.isPending} onClick={() => answerOffer(offer.id, 'declined')} data-testid={`button-decline-offer-${offer.id}`}>Decline</button></div>}</div>)}</div>}{offerNotice && <div className="inline-note">{offerNotice}</div>}<div className="chat-compose"><input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendMessage(); }} placeholder="Write a message…" data-testid="input-message"/><button className="button button-dark" onClick={sendMessage} disabled={!text.trim() || send.isPending} data-testid="button-send-message">Send <ArrowRight size={15}/></button></div>{notice && <div className="inline-note">{notice}</div>}</> : <div className="chat-welcome"><span className="state-icon"><MessageCircle/></span><h2>Your conversations, all here.</h2><p>Choose a conversation to pick up where you left off, or message a seller from a listing.</p><Link href="/browse" className="button button-outline">Explore livestock <ArrowRight size={15}/></Link></div>}</section></div></main></Shell>;
}
function Transactions() {
  const { transactionId } = useParams<{ transactionId?: string }>();
  const items = useListTransactions();
  const detail = useGetTransaction(transactionId || '', { query: { queryKey: getGetTransactionQueryKey(transactionId || ''), enabled: !!transactionId } });
  const dispute = useGetTransactionDispute(transactionId || '', { query: { queryKey: getGetTransactionDisputeQueryKey(transactionId || ''), enabled: !!transactionId } });
  const profile = useGetMyProfile();
  const confirm = useConfirmReceipt();
  const openDispute = useOpenDispute();
  const respondDispute = useRespondToDispute();
  const markDelivered = useMarkTransactionDelivered();
  const [reason, setReason] = useState('');
  const [responseText, setResponseText] = useState('');
  const [disputeFormOpen, setDisputeFormOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const txn = detail.data;
  const refreshTransaction = (id: string) => {
    queryClient.invalidateQueries({ queryKey: getGetTransactionQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetTransactionDisputeQueryKey(id) });
  };
  const submitDispute = () => {
    if (!txn || reason.trim().length < 10) return;
    openDispute.mutate({ transactionId: txn.id, data: { reason: reason.trim(), evidencePaths: [] } }, {
      onSuccess: () => { refreshTransaction(txn.id); setNotice('Dispute submitted for review.'); setDisputeFormOpen(false); },
      onError: () => setNotice('Could not open a dispute. No dispute was recorded.'),
    });
  };
  const submitSellerResponse = () => {
    if (!dispute.data || responseText.trim().length < 10) return;
    respondDispute.mutate({ disputeId: dispute.data.id, data: { message: responseText.trim(), evidencePaths: [] } }, {
      onSuccess: () => { refreshTransaction(dispute.data!.transactionId); setResponseText(''); setNotice('Your response was submitted to the dispute record.'); },
      onError: () => setNotice('Your response could not be submitted. No dispute status was changed.'),
    });
  };
  const deliver = () => {
    if (!txn || txn.paymentProvider === 'unconfigured' || txn.status !== 'funds_held' || txn.sellerId !== profile.data?.userId) return;
    markDelivered.mutate({ transactionId: txn.id }, {
      onSuccess: () => { refreshTransaction(txn.id); setNotice('Delivery status updated by the transaction provider.'); },
      onError: () => setNotice('Delivery status could not be updated. No payment status was changed.'),
    });
  };
  const providerConfigured = !!txn && txn.paymentProvider !== 'unconfigured';
  const canMarkDelivered = providerConfigured && txn?.status === 'funds_held' && txn?.sellerId === profile.data?.userId;
  return <Shell><main className="dashboard-page wrap"><div className="dashboard-heading"><div><span className="eyebrow">Your transactions</span><h1>Deal details, clearly.</h1><p>Payment and delivery status are shown exactly as reported by the transaction provider.</p></div><WalletCards className="heading-art"/></div>{transactionId ? detail.isLoading ? <div className="detail-skeleton shimmer"/> : detail.isError || !txn ? <ErrorPanel retry={() => detail.refetch()}/> : <div className="transaction-card"><div className="transaction-top"><span className="eyebrow">Transaction {txn.id.slice(0, 8)}</span><span className="status-tag">{titleCase(txn.status)}</span></div><h2>{money(txn.amountNaira)}</h2><p className="provider-note"><WalletCards size={17}/>{txn.paymentProvider === 'unconfigured' ? 'Payment provider is not configured. Funds are not held in escrow.' : `Provider: ${titleCase(txn.paymentProvider)} · Status: ${titleCase(txn.status)}`}</p><div className="transaction-data"><span>Marketplace fee <b>{money(txn.feeNaira)}</b></span><span>Created <b>{new Date(txn.createdAt).toLocaleDateString()}</b></span>{txn.receiptDeadline && <span>Receipt deadline <b>{new Date(txn.receiptDeadline).toLocaleDateString()}</b></span>}</div><div className="transaction-controls"><button className="button button-dark" onClick={() => confirm.mutate({ transactionId: txn.id }, { onSuccess: () => { refreshTransaction(txn.id); setNotice('Receipt confirmation was recorded by the transaction service.'); }, onError: () => setNotice('Receipt confirmation is unavailable. No status was changed.') })} disabled={confirm.isPending || txn.status !== 'receipt_window'} data-testid="button-confirm-receipt">Confirm receipt <Check size={15}/></button><button className="button button-outline" onClick={() => setDisputeFormOpen(!disputeFormOpen)} disabled={openDispute.isPending || !!dispute.data} data-testid="button-open-dispute">{dispute.data ? 'Dispute already open' : 'Open a dispute'}</button><button className="button button-outline" onClick={deliver} disabled={!canMarkDelivered || markDelivered.isPending} title={!providerConfigured ? 'Unavailable: the API reports that the payment provider is not configured.' : !canMarkDelivered ? 'Only the seller can update delivery when escrow reports funds held.' : undefined} data-testid="button-mark-delivered">{!providerConfigured ? 'Delivery update unavailable' : markDelivered.isPending ? 'Updating delivery…' : 'Mark delivered'}</button></div>{!providerConfigured && <div className="provider-disclosure compact-disclosure"><ShieldCheck size={17}/><p>Escrow and delivery workflow unavailable: this transaction reports an unconfigured payment provider. Funds are not held.</p></div>}{disputeFormOpen && <div className="dispute-form"><label>What happened?<textarea value={reason} onChange={e => setReason(e.target.value)} minLength={10} maxLength={2000} placeholder="Describe the issue (at least 10 characters)" data-testid="input-dispute-reason"/></label><button className="button button-dark" onClick={submitDispute} disabled={reason.trim().length < 10 || openDispute.isPending} data-testid="button-submit-dispute">{openDispute.isPending ? 'Submitting…' : 'Submit dispute'}</button></div>}{dispute.isLoading ? <div className="offer-state shimmer"/> : dispute.isError ? <div className="inline-note">Dispute details could not be loaded. <button className="text-link" onClick={() => dispute.refetch()}>Retry</button></div> : dispute.data && <section className="transaction-dispute"><div className="transaction-top"><h3>Dispute · {titleCase(dispute.data.status)}</h3><span className="status-tag">{titleCase(dispute.data.status)}</span></div><p>{dispute.data.reason}</p>{dispute.data.sellerResponse && <div className="seller-response"><b>Seller response</b><p>{dispute.data.sellerResponse}</p></div>}{txn.sellerId === profile.data?.userId && !dispute.data.sellerResponse && <div className="dispute-form"><label>Respond to this dispute<textarea value={responseText} onChange={e => setResponseText(e.target.value)} minLength={10} maxLength={2000} placeholder="Share your response (at least 10 characters)" data-testid="input-dispute-response"/></label><button className="button button-dark" onClick={submitSellerResponse} disabled={responseText.trim().length < 10 || respondDispute.isPending} data-testid="button-respond-dispute">{respondDispute.isPending ? 'Submitting response…' : 'Submit response'}</button></div>}</section>}{notice && <div className="inline-note">{notice}</div>}</div> : items.isLoading ? <div className="transaction-card shimmer"/> : items.isError ? <ErrorPanel retry={() => items.refetch()}/> : items.data?.length ? <div className="transaction-list">{items.data.map(t => <Link href={`/transactions/${t.id}`} key={t.id} className="transaction-row"><span className="transaction-id"><WalletCards size={17}/><span><b>{money(t.amountNaira)}</b><small>{new Date(t.createdAt).toLocaleDateString()}</small></span></span><span className="status-tag">{titleCase(t.status)}</span><span>{t.paymentProvider === 'unconfigured' ? 'Payment setup not configured' : titleCase(t.paymentProvider)}</span><ArrowRight size={16}/></Link>)}</div> : <EmptyPanel title="No transactions yet." detail="When a transaction is created, its payment and delivery status will appear here."/>}{!transactionId && <div className="provider-disclosure"><ShieldCheck size={18}/><p><b>Clear payment status, always.</b> Escrow depends on an active payment provider. We will never describe funds as held unless the transaction reports that status.</p></div>}</main></Shell>;
}
function Admin() {
  const dashboard = useGetAdminDashboard();
  const verifications = useListAdminVerifications();
  const disputes = useListAdminDisputes();
  const flags = useListAdminFlags();
  const review = useReviewSellerVerification();
  const resolve = useResolveDispute();
  const reviewFlag = useReviewFlag();
  const [note, setNote] = useState('');
  const reviewSeller = (id: string, status: 'approved'|'rejected') => { const msg = window.prompt(`Review note for ${status === 'approved' ? 'approval' : 'rejection'} (at least 3 characters)`); if (msg && msg.trim().length >= 3) review.mutate({ verificationId: id, data: { status, reviewNote: msg.trim() } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListAdminVerificationsQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); setNote('Verification review saved.'); }, onError: () => setNote('Review action failed.') }); };
  const decide = (id: string, decision: 'resolved_for_buyer'|'resolved_for_seller') => { const resolutionNote = window.prompt('Add a resolution note (at least 3 characters)'); if (resolutionNote && resolutionNote.trim().length >= 3) resolve.mutate({ disputeId: id, data: { decision, resolutionNote: resolutionNote.trim() } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListAdminDisputesQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }); setNote('Dispute resolution saved.'); }, onError: () => setNote('Dispute resolution failed.') }); };
  const actionFlag = (flagId: string, status: 'reviewed'|'dismissed') => reviewFlag.mutate({ flagId, data: { status } }, {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListAdminFlagsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
      setNote(`Report marked ${status}.`);
    },
    onError: () => setNote('Could not update this report.'),
  });
  const summary = dashboard.data;
  return <Shell><main className="dashboard-page wrap"><div className="dashboard-heading"><div><span className="eyebrow">Marketplace operations</span><h1>Admin desk</h1><p>Review seller applications and resolve marketplace disputes.</p></div><span className="admin-mark"><ShieldCheck/></span></div>{dashboard.isError ? <ErrorPanel retry={() => dashboard.refetch()}/> : <div className="admin-metrics">{[['Active listings', summary?.activeListings], ['Pending verification', summary?.pendingVerifications], ['Open disputes', summary?.openDisputes], ['Transactions', summary?.totalTransactions]].map(([label, value]) => <div className="admin-metric" key={String(label)}><span>{label}</span><b>{dashboard.isLoading ? '—' : value}</b><small>Marketplace summary</small></div>)}</div>}<div className="admin-queues"><section><div className="dashboard-section-title"><div><span className="eyebrow">Seller applications</span><h2>Verification queue</h2></div><span className="counter">{verifications.data?.length ?? 0}</span></div>{verifications.isLoading ? <div className="queue-skeleton shimmer"/> : verifications.isError ? <ErrorPanel retry={() => verifications.refetch()}/> : verifications.data?.length ? verifications.data.map(v => <article className="queue-card" key={v.id}><div className="queue-card-head"><div className="seller-avatar"><FileCheck2 size={16}/></div><div><b>{v.displayName}</b><span>{v.city}, {v.state} · {titleCase(v.status)}</span></div><small>{new Date(v.submittedAt).toLocaleDateString()}</small></div>{v.documentPath && <a href={`/api/storage${v.documentPath}`} target="_blank" rel="noreferrer" className="text-link">Review identity document <ArrowRight size={13}/></a>}<div className="queue-actions"><button className="button button-dark button-small" onClick={() => reviewSeller(v.id, 'approved')} data-testid={`button-approve-${v.id}`}>Approve</button><button className="button button-outline button-small" onClick={() => reviewSeller(v.id, 'rejected')} data-testid={`button-reject-${v.id}`}>Reject</button></div></article>) : <EmptyPanel title="Nothing to review." detail="New seller submissions will appear here."/>}</section><section><div className="dashboard-section-title"><div><span className="eyebrow">Buyer or seller reports</span><h2>Dispute queue</h2></div><span className="counter">{disputes.data?.length ?? 0}</span></div>{disputes.isLoading ? <div className="queue-skeleton shimmer"/> : disputes.isError ? <ErrorPanel retry={() => disputes.refetch()}/> : disputes.data?.length ? disputes.data.map(d => <article className="queue-card" key={d.id}><div className="queue-card-head"><span className="state-icon compact"><CircleHelp/></span><div><b>{titleCase(d.status)}</b><span>Transaction {d.transactionId.slice(0, 8)} · {new Date(d.createdAt).toLocaleDateString()}</span></div></div><p className="dispute-reason">{d.reason}</p>{d.sellerResponse && <p className="seller-response"><b>Seller response:</b> {d.sellerResponse}</p>}<div className="queue-actions"><button className="button button-dark button-small" onClick={() => decide(d.id, 'resolved_for_buyer')}>Resolve for buyer</button><button className="button button-outline button-small" onClick={() => decide(d.id, 'resolved_for_seller')}>Resolve for seller</button></div></article>) : <EmptyPanel title="No open disputes." detail="Disputes that need a marketplace decision appear here."/>}</section><section><div className="dashboard-section-title"><div><span className="eyebrow">Safety reports</span><h2>Marketplace flags</h2></div><span className="counter">{flags.data?.length ?? 0}</span></div>{flags.isLoading ? <div className="queue-skeleton shimmer"/> : flags.isError ? <ErrorPanel retry={() => flags.refetch()}/> : flags.data?.length ? flags.data.map(flag => <article className="queue-card" key={flag.id}><div className="queue-card-head"><span className="state-icon compact"><ShieldCheck/></span><div><b>{titleCase(flag.reason)}</b><span>User {flag.reportedUserId.slice(0, 10)} · {new Date(flag.createdAt).toLocaleDateString()}</span></div></div><p className="dispute-reason">{flag.details}</p>{flag.listingId && <Link className="text-link" href={`/listing/${flag.listingId}`}>Open reported listing <ArrowRight size={13}/></Link>}<div className="queue-actions"><button className="button button-dark button-small" disabled={reviewFlag.isPending} onClick={() => actionFlag(flag.id, 'reviewed')} data-testid={`button-review-flag-${flag.id}`}>Mark reviewed</button><button className="button button-outline button-small" disabled={reviewFlag.isPending} onClick={() => actionFlag(flag.id, 'dismissed')} data-testid={`button-dismiss-flag-${flag.id}`}>Dismiss</button></div></article>) : <EmptyPanel title="No safety flags." detail="Reports about users and listings appear here for review."/>}</section></div>{note && <div className="inline-note">{note}</div>}</main></Shell>;
}
function Router() {
  return <Switch>
    <Route path="/" component={HomeRedirect}/><Route path="/browse" component={Browse}/><Route path="/listing/:listingId" component={ListingDetail}/>
    <Route path="/sign-in/*?" component={SignInPage}/><Route path="/sign-up/*?" component={SignUpPage}/>
    <Route path="/account/setup" component={Setup}/><Route path="/seller" component={Seller}/><Route path="/seller/verification" component={SellerVerification}/><Route path="/seller/listings/new" component={NewListing}/>
    <Route path="/messages" component={Messages}/><Route path="/messages/:conversationId" component={Messages}/><Route path="/transactions" component={Transactions}/><Route path="/transactions/:transactionId" component={Transactions}/><Route path="/admin" component={Admin}/>
    <Route><Shell><main className="not-found wrap"><span className="eyebrow">404 · Not found</span><h1>This path isn’t on the map.</h1><p>Let’s get you back to the marketplace.</p><Link className="button button-dark" href="/">Back to home <ArrowRight size={16}/></Link></main></Shell></Route>
  </Switch>;
}
function HomeRedirect() {
  return <><Show when="signed-in"><AuthenticatedHomeRedirect/></Show><Show when="signed-out"><Home/></Show></>;
}
function AuthenticatedHomeRedirect() {
  const profile = useGetMyProfile();
  if (profile.isLoading) return <Shell><main className="home-redirect-state wrap"><div className="detail-skeleton shimmer"/></main></Shell>;
  if (profile.isError) return <Shell><main className="home-redirect-state wrap"><ErrorPanel retry={() => profile.refetch()}/></main></Shell>;
  if (!profile.data) return <Redirect to="/account/setup"/>;
  if (profile.data.role === 'admin') return <Redirect to="/admin"/>;
  if (profile.data.role === 'seller') return <Redirect to="/seller"/>;
  return <Redirect to="/browse"/>;
}
function SignInPage() {
  return <main className="auth-page"><div className="auth-art"><Brand inverse/><div className="auth-art-copy"><span className="eyebrow light-eyebrow">A marketplace built on trust</span><h1>Good trade starts with good people.</h1><p>Connect with farms and buyers across Nigeria.</p></div><span className="auth-art-foot">NaijaLivestock · Across Nigeria</span></div><section className="auth-content clerk-auth-content"><div className="clerk-heading"><span className="eyebrow">Welcome back</span><h2>Sign in to continue.</h2><p>Pick up where your next good trade begins.</p></div><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}/><Link href="/" className="auth-marketplace-link"><ArrowLeft size={14}/> Return to marketplace</Link></section></main>;
}
function SignUpPage() {
  return <main className="auth-page"><div className="auth-art"><Brand inverse/><div className="auth-art-copy"><span className="eyebrow light-eyebrow">A marketplace built on trust</span><h1>Good trade starts with good people.</h1><p>Join local buyers and approved farms across Nigeria.</p></div><span className="auth-art-foot">NaijaLivestock · Across Nigeria</span></div><section className="auth-content clerk-auth-content"><div className="clerk-heading"><span className="eyebrow">Join the marketplace</span><h2>Create your account.</h2><p>A good livestock deal starts with a verified account.</p></div><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`}/><Link href="/" className="auth-marketplace-link"><ArrowLeft size={14}/> Return to marketplace</Link></section></main>;
}
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (previousUserId.current !== undefined && previousUserId.current !== userId) client.clear();
      previousUserId.current = userId;
    });
    return unsubscribe;
  }, [addListener, client]);
  return null;
}
function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return <ClerkProvider
    publishableKey={clerkPubKey}
    proxyUrl={clerkProxyUrl}
    appearance={clerkAppearance}
    signInUrl={`${basePath}/sign-in`}
    signUpUrl={`${basePath}/sign-up`}
    localization={{
      signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to access your marketplace account.' } },
      signUp: { start: { title: 'Join NaijaLivestock', subtitle: 'Create an account to trade with confidence.' } },
    }}
    routerPush={to => setLocation(stripBase(to))}
    routerReplace={to => setLocation(stripBase(to), { replace: true })}
  >
    <ClerkQueryClientCacheInvalidator/>
    <RoutedErrorBoundary><Router/></RoutedErrorBoundary>
  </ClerkProvider>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={basePath}><ClerkProviderWithRoutes/></WouterRouter><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
