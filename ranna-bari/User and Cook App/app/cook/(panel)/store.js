/**
 * The cook's shop, at a glance.
 *
 * A hub rather than a tab: the cook bar already carries six destinations, and
 * a shop is a place you go into and work in for a while rather than something
 * you flick between. Everything under it hangs off this screen.
 *
 * The numbers are chosen to be the ones that need acting on. Total products
 * is trivia; five things out of stock and two pre-orders nobody has answered
 * are today's work, so those are the ones that get colour.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { toStorableImage } from '../../../src/lib/pickedImage';
import { KNOWN_AREAS, normaliseArea } from '../../../src/lib/areas';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import SectionHeader from '../../../src/components/SectionHeader';
import ServiceAreaPicker from '../../../src/components/ServiceAreaPicker';
import LocationPicker from '../../../src/components/LocationPicker';
import FloatLabelInput from '../../../src/components/FloatLabelInput';
import {
  ActionRow,
  FieldError,
  RadiusSlider,
  ShopNotFound,
  WizardSteps,
  resolveShop,
} from '../../../src/components/CookBits';
import { CountTile, EmptyState } from '../../../src/components/MealBits';
import { BlockLabel } from '../../../src/components/StoreBits';
import { Body } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, tracking, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { useAction } from '../../../src/components/Alert';
import TagPicker from '../../../src/components/TagPicker';
import DeliveryFees from '../../../src/components/DeliveryFees';
import { useLang } from '../../../src/i18n/LanguageContext';

/* How many shops one kitchen may open — the server's own cap
   (`STORES_PER_KITCHEN`); past it the "New shop" button goes away instead of
   leading to a form that would be refused at the end. */
const MAX_SHOPS = 5;

export default function CookStoreHub() {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  /* Every write below reports what happened. */
  const run = useAction();
  const router = useRouter();
  const { kitchen } = useKitchen();
  const shop = useCommerce();

  /* Every shop this kitchen owns, and the one the hub is looking at.
     The route's `?shop=` param carries the choice in from the dashboard and
     the listings rows; inside the hub the switcher chips keep it. */
  const { shop: shopParam } = useLocalSearchParams();
  const shops = kitchen ? shop.myStores(kitchen.id) : [];
  /* `new` is the switcher asking for the setup flow; anything else names a
     shop, and a name this kitchen does not have is said rather than swapped
     for the first shop — see `resolveShop`. */
  const resolved = shopParam === 'new' ? { store: null, missing: false } : resolveShop(shops, shopParam);
  const store = resolved.store;

  if (resolved.missing) {
    return (
      <CookScreen>
        <Container>
          <Back />
          <ShopNotFound onBack={() => router.replace('/cook/store')} />
        </Container>
      </CookScreen>
    );
  }

  /* No shop yet — none at all, or the switcher asked for a new one: a
     three-step setup, not a single blind button. The old flow opened the
     shop silently with borrowed values and dropped the cook into settings —
     the shop existed before they had said anything about it. The cook says
     what it is called, what it looks like and what delivery costs by the
     time it exists. */
  if (!store) {
    return (
      <CookScreen>
        <Container>
          <Back />
          <SectionHeader
            lead={t('YOUR')}
            accent={t('SHOP')}
            subtitle={t('Sell cakes, pitha, achar — anything you make that keeps.')}
          />
          <StoreSetup kitchen={kitchen} />
        </Container>
      </CookScreen>
    );
  }

  const view = shop.storeOverview(store);

  /* Each row below works on one shop, so the screens it opens have to know
     which — the param travels with every push. */
  const withShop = (path) =>
    router.push({ pathname: path, params: { shop: String(store.id) } });

  return (
    <CookScreen>
      <Container>
        <Back />

        <SectionHeader
          lead={t('YOUR')}
          accent={t('SHOP')}
          subtitle={
            store.isOpen
              ? t('{name} is open.', { name: store.name })
              : t('{name} is closed. Nothing can be bought.', { name: store.name })
          }
        />

        {/* ---- the storefront's own words, back to the cook ---- */}
        {store.tagline ? (
          <Text
            style={{
              fontFamily: font.uiSemi,
              fontSize: type.sm + 1,
              color: colors.sage,
              marginTop: -10,
              marginBottom: 6,
            }}
          >
            {store.tagline}
          </Text>
        ) : null}

        {/* ---- who can see it ----
            "Open" and "visible" kept getting confused: a cook flips the
            shutter, still hears from nobody, and concludes the app is broken.
            The same matcher the customer side runs is stated here, plainly —
            coverage when it is set, the radius when it is not. */}
        <Text
          style={{
            fontFamily: font.ui,
            fontSize: type.xs + 1,
            lineHeight: type.xs * 1.7,
            color: colors.textMuted,
            marginTop: -10,
            marginBottom: 16,
          }}
        >
          {store.allBangladesh
            ? t('Customers all over Bangladesh can see this shop.')
            : (store.serviceAreas ?? []).length
              ? t('Customers in {list} can see this shop.', {
                  list: store.serviceAreas
                    .map((r) =>
                      !(r.areas ?? []).length ? r.division : `${r.division}: ${r.areas.join(', ')}`,
                    )
                    .join('; '),
                })
              : store.deliveryRadiusKm > 0
                ? store.area
                  ? t('Customers within {n} km of {area} can see this shop.', {
                      n: n(store.deliveryRadiusKm),
                      area: store.area,
                    })
                  : t('Customers within {n} km can see this shop.', {
                      n: n(store.deliveryRadiusKm),
                    })
                : t('No distance limit — customers anywhere can see this shop.')}
        </Text>

        {/* ---- the switcher ----
            One kitchen, several shops: this row is how the hub says which
            one is open underneath — and where "New shop" lives. It used to be
            hidden whenever there was a single shop ("a switcher with one
            choice is chrome"), which also hid the only button that opens a
            second one: a cook with one shop had no way to make another. So it
            shows until the cap is reached, and past that only when there is
            something to switch between. */}
        {shops.length > 1 || shops.length < MAX_SHOPS ? (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 18,
            }}
          >
            {shops.map((s) => {
              const on = String(s.id) === String(store.id);
              return (
                <Pressable
                  key={String(s.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    router.setParams({ shop: String(s.id) });
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: 9,
                    paddingHorizontal: 14,
                    borderRadius: radius.pill,
                    backgroundColor: on ? colors.sage : colors.surfaceSolid,
                    borderWidth: 1,
                    borderColor: on ? colors.sage : colors.line,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  })}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      maxWidth: 130,
                      fontFamily: on ? font.uiBold : font.uiSemi,
                      fontSize: 13,
                      color: on ? '#FFFFFF' : colors.text,
                    }}
                  >
                    {s.name || t('Shop')}
                  </Text>
                </Pressable>
              );
            })}
            {/* Opening yet another shop reuses the setup flow — the same
                three steps, starting empty. Gone at the cap, rather than
                leading to a form the server would refuse at the end. */}
            {shops.length < MAX_SHOPS ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('New shop')}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                router.setParams({ shop: 'new' });
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 9,
                paddingHorizontal: 14,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: pressed ? colors.sage : colors.line,
                backgroundColor: pressed ? colors.sage50 : 'transparent',
              })}
            >
              <Icon name="plus" size={13} color={colors.sage} strokeWidth={2.4} />
              <Text
                style={{
                  fontFamily: font.uiSemi,
                  fontSize: 13,
                  color: colors.sage,
                }}
              >
                {t('New shop')}
              </Text>
            </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* ---- the shutter ---- */}
        <Reveal delay={1}>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: store.isOpen }}
            accessibilityLabel={store.isOpen ? t('Shop open') : t('Tap to open your shop')}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              run(
                () => shop.toggleStoreOpen(store.id),
                () => (store.isOpen ? t('Shop closed.') : t('Shop is open.')),
              );
            }}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 16,
                padding: 18,
                borderRadius: radius.md,
                backgroundColor: store.isOpen ? colors.sage : colors.sunken,
                borderWidth: 1,
                borderColor: store.isOpen ? 'transparent' : colors.line,
                transform: [{ scale: pressed ? 0.99 : 1 }],
              },
              store.isOpen ? shadow.md : shadow.sm,
            ]}
          >
            <Icon
              name={store.isOpen ? 'box' : 'moon'}
              size={22}
              color={store.isOpen ? '#FFFFFF' : colors.textMuted}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontFamily: font.displayExtra,
                  fontSize: 20,
                  letterSpacing: -0.4,
                  color: store.isOpen ? '#FFFFFF' : colors.text,
                }}
              >
                {store.isOpen ? t('Shop open') : t('Shop closed')}
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontFamily: font.ui,
                  fontSize: type.xs + 1,
                  color: store.isOpen ? 'rgba(255,255,255,0.9)' : colors.textMuted,
                }}
              >
                {store.isOpen
                  ? t('{n} products on sale', { n: n(view.active) })
                  : t('Tap to start selling')}
              </Text>
            </View>
          </Pressable>
        </Reveal>

        {/* ---- what needs doing ---- */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <CountTile
            value={n(view.pendingPreorders)}
            label={t('Pre-orders')}
            tone={view.pendingPreorders ? 'primary' : 'sage'}
          />
          <CountTile
            value={n(view.activeOrders)}
            label={t('Active orders')}
            tone={view.activeOrders ? 'saffron' : 'sage'}
          />
          <CountTile
            value={n(view.outOfStock)}
            label={t('Out of stock')}
            tone={view.outOfStock ? 'saffron' : 'sage'}
          />
        </View>

        {/* ---- the money ---- */}
        <View
          style={[
            {
              flexDirection: 'row',
              marginTop: 12,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: colors.line,
              overflow: 'hidden',
            },
            shadow.sm,
          ]}
        >
          <Money label={t('Released to you')} amount={view.earned} tone="sage" />
          <View style={{ width: 1, backgroundColor: colors.line2 }} />
          <Money label={t('Held for you')} amount={view.pending} tone="saffron" />
        </View>

        {/* ---- the catalogue in numbers ---- */}
        <View style={{ marginTop: 26 }}>
          <BlockLabel text={t('Your catalogue')} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <CountTile value={n(view.products)} label={t('Products')} />
            <CountTile value={n(view.categories)} label={t('Categories')} />
            <CountTile value={n(view.preorderable)} label={t('Pre-orderable')} />
            <CountTile value={n(view.completedOrders)} label={t('Completed')} />
          </View>
        </View>

        {/* ---- everything you can do ---- */}
        <View style={{ marginTop: 26, gap: 12 }}>
          <BlockLabel text={t('Manage')} />
          <ActionRow
            icon="plus"
            tone="primary"
            title={t('Add a product')}
            sub={t('Name, price, stock and photos')}
            onPress={() => withShop('/cook/store/product/new')}
          />
          <ActionRow
            icon="box"
            title={t('Products and stock')}
            sub={t('{n} listed, {out} out of stock', {
              n: n(view.products),
              out: n(view.outOfStock),
            })}
            onPress={() => withShop('/cook/store/products')}
          />
          <ActionRow
            icon="sliders"
            title={t('Categories')}
            sub={t('{n} categories, in your own order', { n: n(view.categories) })}
            onPress={() => withShop('/cook/store/categories')}
          />
          <ActionRow
            icon="clock"
            tone={view.pendingPreorders ? 'primary' : 'sage'}
            title={t('Pre-orders')}
            sub={
              view.pendingPreorders
                ? t('{n} waiting for your answer', { n: n(view.pendingPreorders) })
                : t('Nothing waiting')
            }
            onPress={() => withShop('/cook/store/preorders')}
          />
          <ActionRow
            icon="receipt"
            title={t('Shop orders')}
            sub={t('{n} in progress', { n: n(view.activeOrders) })}
            onPress={() => withShop('/cook/store/orders')}
          />
          <ActionRow
            icon="chefHat"
            title={t('Shop settings')}
            sub={t('Name, photos, delivery and contact')}
            onPress={() => withShop('/cook/store/settings')}
          />
          <ActionRow
            icon="eye"
            title={t('View your shop')}
            sub={t('See it the way a customer does')}
            onPress={() => router.push(`/stores/${store.id}`)}
          />
        </View>
      </Container>
    </CookScreen>
  );
}

function Back() {
  const { colors } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/cook'))}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 18,
        alignSelf: 'flex-start',
      }}
    >
      <Icon name="arrowLeft" size={16} color={colors.sage} strokeWidth={2} />
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: type.xs,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: colors.sage,
        }}
      >
        {t('Kitchen')}
      </Text>
    </Pressable>
  );
}

function Money({ label, amount, tone }) {
  const { colors } = useTheme();
  const { n } = useLang();
  const accent = tone === 'saffron' ? colors.saffron : colors.sage;
  return (
    <View style={{ flex: 1, gap: 4, padding: 16 }}>
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: 10,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{
          fontFamily: font.displayExtra,
          fontSize: 26,
          letterSpacing: -0.6,
          color: accent,
        }}
      >
        ৳{n(amount)}
      </Text>
    </View>
  );
}

/**
 * The vocabulary a shop names itself with. Deliberately short — five chips
 * is a shelf sign, forty is a form. Displayed through t() like every string.
 */
const SHOP_TAGS = [
  'Homemade',
  'Achar',
  'Pitha',
  'Cakes & bakes',
  'Dry snacks',
  'Honey & ghee',
  'Gift boxes',
];

/**
 * The steps between "no shop" and "a shop" — with nothing borrowed.
 *
 * The shop is the cook's *second* business, not an annex of the first: it is
 * born with its own name, its own photographs and its own delivery terms.
 * Nothing here reads the kitchen — an earlier flow prefilled the kitchen's
 * name, logo, cover, area and radius, which silently made every new shop a
 * copy of the kitchen it sat beside. Three steps, all the cook's own words
 * and pictures, and the storefront belongs to the shop alone.
 *
 * The one link that remains is ownership — the shop is created against the
 * cook's kitchen, which is what lets the same token edit it and sends its
 * money to the same wallet. That is a fact about the ledger, not the brand.
 */
function StoreSetup({ kitchen }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const shop = useCommerce();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  /* Per-photo note — the wait while a picture is resized, and the failure
     if it cannot be read. */
  const [photoNote, setPhotoNote] = useState('');

  /* Every field starts empty. The kitchen's values are one tap away in
     settings if the cook wants them; starting identical to the kitchen is
     the one thing this flow must not do. */
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  /* Shop label chips — what this shop *is*, in one tap each. */
  const [tags, setTags] = useState([]);
  const [logo, setLogo] = useState('');
  const [cover, setCover] = useState('');
  const [area, setArea] = useState('');
  /* Where the shop actually is. `draft` is wherever the map is resting right
     now (it reports once on load, so it is never proof the cook chose
     anything); `pin` is a spot the cook confirmed with the button. Only a
     confirmed pin lets the flow continue and is posted — a shop must not be
     born with a location nobody picked, and must not silently inherit the
     kitchen's. The kitchen's pin only decides where the map *opens*. */
  const [draft, setDraft] = useState(null);
  const [pin, setPin] = useState(null);
  const [radiusKm, setRadiusKm] = useState(3);
  /* Coverage, chosen in step 3. A new shop that never picks any keeps the
     radius behaviour, exactly like every shop that predates the picker. */
  const [coverage, setCoverage] = useState({ allBangladesh: false, serviceAreas: [] });
  /* Delivery costs two prices — inside the shop's own division and everywhere
     else — and the division is read off the kitchen's map pin (the shop has
     none of its own yet), so it is never typed. */
  const [home, setHome] = useState('');
  const [feeInside, setFeeInside] = useState('');
  const [feeOutside, setFeeOutside] = useState('');

  const STEPS = [t('The storefront'), t('Photos'), t('Location'), t('Delivery')];

  /* Confirming the spot also names the area: the reverse-geocoded address is
     matched against the neighbourhoods we know, and only a real match
     replaces what the cook already chose — an address that matches nothing
     must not wipe a chip they picked, and a wrong guess is one tap to fix. */
  const pinHere = () => {
    if (!draft) return;
    setPin({ lat: draft.lat, lng: draft.lng });
    if (draft.address) {
      const guess = normaliseArea(draft.address);
      if (KNOWN_AREAS.includes(guess)) setArea(guess);
    }
    setErrors({});
    Haptics.selectionAsync().catch(() => {});
  };
  const pinIsDraft =
    !!pin && !!draft && pin.lat === draft.lat && pin.lng === draft.lng;

  /* ---- photograph picking ----
     Same rule as everywhere else in the panel: a stored picture is kept as
     it is, a fresh pick is resized to the role it will live at, so the tile
     always shows exactly what will be posted. */
  const pickPhoto = async (role) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setPhotoNote(t('RannaBari needs photo access to set a product photo.'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: role === 'cover' ? [3, 1] : [1, 1],
      quality: 0.6,
      base64: true,
    });
    if (res.canceled || !res.assets?.[0]) return;

    setPhotoNote('');
    const stored = await toStorableImage(res.assets[0], role);
    if (!stored) {
      setPhotoNote(t('That photo could not be read. Please try another.'));
      return;
    }
    if (role === 'cover') setCover(stored);
    else setLogo(stored);
    Haptics.selectionAsync().catch(() => {});
  };

  const next = () => {
    if (step === 0 && !name.trim()) {
      setErrors({ name: t('Give the shop a name.') });
      return;
    }
    /* The shop's own face, both pieces. A logo without a banner reads half
       dressed in the directory, and this is the one moment asking for both
       costs nothing. */
    if (step === 1 && (!logo || !cover)) {
      setErrors({ photos: t('Add a logo and a cover — this shop needs its own face.') });
      return;
    }
    /* No pin, no shop: the map and distance filters need a real spot. */
    if (step === 2 && !pin) {
      setErrors({ pin: t('Move the map to your shop, then tap “Pin the shop here”.') });
      return;
    }
    /* The map names the area when it can; when the address matched nothing
       the cook names it with a chip — a shop with a pin and no area would
       show a blank place on its card. */
    if (step === 2 && !area) {
      setErrors({ pin: t('Pick the area your shop is in.') });
      return;
    }
    setErrors({});
    Haptics.selectionAsync().catch(() => {});
    setStep((s) => s + 1);
  };

  const open = async () => {
    /* Belt and braces: the step guard stops the normal path, this stops a
       stale state from ever posting a shop without a spot. */
    if (!pin) {
      setStep(2);
      setErrors({ pin: t('Move the map to your shop, then tap “Pin the shop here”.') });
      return;
    }
    /* An empty box is a price of nothing — a cook who skips it is not
       charging for delivery, rather than being refused for leaving it blank. */
    const insideValue = Number(feeInside || '0');
    const outsideValue = Number(feeOutside || '0');
    if (
      !Number.isFinite(insideValue) ||
      insideValue < 0 ||
      !Number.isFinite(outsideValue) ||
      outsideValue < 0
    ) {
      setErrors({ fee: t('Delivery fee is a number of taka.') });
      return;
    }
    /* Two different prices need to know which side is which. */
    if (Math.round(insideValue) !== Math.round(outsideValue) && !home) {
      setErrors({ fee: t('Pick the division your shop is in.') });
      return;
    }

    setSaving(true);
    const out = await shop.saveStore(kitchen.id, {
      name: name.trim(),
      tagline: tagline.trim(),
      tags,
      logo,
      cover,
      area: area ? normaliseArea(area) : '',
      lat: pin.lat,
      lng: pin.lng,
      deliveryRadiusKm: radiusKm,
      serviceAreas: coverage.serviceAreas,
      allBangladesh: coverage.allBangladesh,
      /* The flat `deliveryFee` follows the inside price, so every screen that
         still reads one number shows the home fee. */
      deliveryFee: Math.round(insideValue),
      homeDivision: home,
      deliveryFeeInsideDhaka: Math.round(insideValue),
      deliveryFeeOutsideDhaka: Math.round(outsideValue),
      freeDeliveryOver: null,
    });
    setSaving(false);

    if (!out.ok) {
      setErrors({ form: out.message || t('That did not work') });
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    /* Straight into settings, where the finer details live — the shop now
       exists on its own terms. Settings names its shop on the route: without
       `?shop=` it falls back to the first shop and the cook would be
       polishing the older business while believing they were setting up this
       one. The create response names the shop it made. */
    const newId = out.result?.store?.id;
    router.push({
      pathname: '/cook/store/settings',
      ...(newId ? { params: { shop: String(newId) } } : {}),
    });
  };

  return (
    <View>
      <WizardSteps steps={STEPS} current={step} />

      <Reveal delay={1}>
        <EmptyState
          icon="box"
          title={t('You have not opened a shop yet')}
          body={t(
            'A second business under the same roof: its own name, its own photos, its own delivery terms. It never borrows the kitchen\'s.',
          )}
        />
      </Reveal>

      {/* ---- step 1 · identity ---- */}
      {step === 0 ? (
        <Reveal delay={2}>
          <View style={{ marginTop: 20 }}>
            <FloatLabelInput
              label={t('Shop name')}
              value={name}
              onChangeText={(v) => {
                setName(v);
                setErrors({});
              }}
              placeholder={t('What customers will call this shop')}
            />
            <FieldError text={errors.name} />

            <FloatLabelInput
              label={t('Tagline (optional)')}
              value={tagline}
              onChangeText={setTagline}
              placeholder={t('One line on what this shop sells')}
            />
            {/* Real sentences beat a blank line — three examples that fill the
                field, and are meant to be edited afterwards, not kept. */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -8, marginBottom: 10 }}>
              {[
                t('Small-batch achar, ground and bottled every week'),
                t('Village-style pitha made to order'),
                t('Home bakes — cakes, cupcakes, gift boxes'),
              ].map((example) => (
                <Pressable
                  key={example}
                  accessibilityRole="button"
                  onPress={() => setTagline(example)}
                  style={({ pressed }) => ({
                    paddingVertical: 7,
                    paddingHorizontal: 11,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: tagline === example ? colors.sage : colors.line,
                    backgroundColor: tagline === example ? colors.sage50 : pressed ? colors.sunken : 'transparent',
                  })}
                >
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: font.ui,
                      fontSize: 11.5,
                      color: colors.textMuted,
                      maxWidth: 260,
                    }}
                  >
                    {example}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* What this shop is, in chips. */}
            <TagPicker value={tags} onChange={setTags} suggestions={SHOP_TAGS} max={5} />

            <Button
              label={t('Continue')}
              icon="arrowRight"
              block
              onPress={next}
              style={{ marginTop: 8 }}
            />
          </View>
        </Reveal>
      ) : null}

      {/* ---- step 2 · the shop's own face ---- */}
      {step === 1 ? (
        <Reveal delay={2}>
          <View style={{ marginTop: 20 }}>
            {photoNote ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 14,
                  padding: 12,
                  borderRadius: radius.sm,
                  backgroundColor: colors.primary50,
                  borderWidth: 1,
                  borderColor: colors.primary100,
                }}
              >
                <Icon name="alertCircle" size={15} color={colors.primary} />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: font.ui,
                    fontSize: type.sm,
                    color: colors.text,
                  }}
                >
                  {photoNote}
                </Text>
              </View>
            ) : null}
            <FieldError text={errors.photos} />

            {/* The cover — the banner the directory and the shop page lead
                with. Cropped 3:1, the exact shape it will be shown in. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={cover ? t('Change cover') : t('Add a cover')}
              onPress={() => pickPhoto('cover')}
              style={({ pressed }) => [
                {
                  height: 130,
                  borderRadius: radius.lg,
                  overflow: 'hidden',
                  borderWidth: 1,
                  borderColor: colors.line,
                  opacity: pressed ? 0.94 : 1,
                },
                shadow.sm,
              ]}
            >
              <Image
                source={cover ? { uri: cover } : null}
                contentFit="cover"
                transition={200}
                style={{ width: '100%', height: '100%', backgroundColor: colors.sunken }}
              />
              <LinearGradient
                colors={['transparent', `rgba(${colors.scrim}, 0.55)`]}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
              />
              <View
                style={{
                  position: 'absolute',
                  left: 14,
                  bottom: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingVertical: 8,
                  paddingHorizontal: 13,
                  borderRadius: radius.pill,
                  backgroundColor: 'rgba(255, 255, 255, 0.22)',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                }}
              >
                <Icon name="gem" size={13} color={colors.onDark} />
                <Text
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: 9.5,
                    letterSpacing: 0.8,
                    textTransform: 'uppercase',
                    color: colors.onDark,
                  }}
                >
                  {cover ? t('Change cover') : t('Add a cover')}
                </Text>
              </View>
            </Pressable>

            {/* The logo — the round face that rides shop cards and chat. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 16,
                marginTop: 14,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Add a photo')}
                onPress={() => pickPhoto('avatar')}
              >
                <Image
                  source={logo ? { uri: logo } : null}
                  contentFit="cover"
                  transition={200}
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: 28,
                    borderWidth: 1,
                    borderColor: colors.line,
                    backgroundColor: colors.sunken,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    right: -2,
                    bottom: -2,
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: colors.sage,
                    borderWidth: 2,
                    borderColor: colors.surfaceSolid,
                  }}
                >
                  <Icon name="plus" size={13} color="#FFFFFF" strokeWidth={2.4} />
                </View>
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontFamily: font.uiSemi,
                    fontSize: type.sm,
                    color: colors.text,
                  }}
                >
                  {t('Shop logo')}
                </Text>
                <Text
                  style={{
                    marginTop: 2,
                    fontFamily: font.ui,
                    fontSize: type.xs,
                    lineHeight: 17,
                    color: colors.textMuted,
                  }}
                >
                  {t('The round picture customers see')}
                </Text>
              </View>
            </View>

            <Button
              label={t('Continue')}
              icon="arrowRight"
              block
              onPress={next}
              style={{ marginTop: 22 }}
            />
          </View>
        </Reveal>
      ) : null}

      {/* ---- step 3 · where the shop is ----
          The shop is its own business, so it gets its own spot. The map opens
          on the kitchen's pin only as a convenient starting point; nothing is
          saved until the cook taps "Pin the shop here". */}
      {step === 2 ? (
        <Reveal delay={2}>
          <View style={{ marginTop: 20 }}>
            <Body muted size={13} style={{ marginBottom: 10 }}>
              {t('Move the map to your shop.')}
            </Body>
            <LocationPicker
              height={260}
              center={
                typeof kitchen?.lat === 'number' && typeof kitchen?.lng === 'number'
                  ? { lat: kitchen.lat, lng: kitchen.lng, zoom: 15 }
                  : undefined
              }
              onChange={(place) => {
                setDraft(place);
                setErrors({});
              }}
            />

            <Button
              label={pinIsDraft ? t('Shop pinned here') : pin ? t('Move the pin here') : t('Pin the shop here')}
              icon={pinIsDraft ? 'check' : 'pin'}
              block
              variant={pinIsDraft ? 'glass' : undefined}
              disabled={!draft || pinIsDraft}
              onPress={pinHere}
              style={{ marginTop: 14 }}
            />
            <FieldError text={errors.pin} />

            {pin ? (
              <Body muted size={13} style={{ marginTop: 6 }}>
                {area
                  ? t('Your shop is in {area}. Not right? Pick the right area below.', { area })
                  : t('Pick the area your shop is in.')}
              </Body>
            ) : null}

            <View style={{ marginTop: 18 }}>
            <Text
              style={{
                fontFamily: font.uiSemi,
                fontSize: type.micro,
                letterSpacing: type.micro * tracking.label,
                textTransform: 'uppercase',
                color: colors.textMuted,
                marginBottom: 12,
              }}
            >
              {t('Your area')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {Array.from(new Set([area, ...KNOWN_AREAS].filter(Boolean))).map((a) => {
                const on = area === a;
                return (
                  <Pressable
                    key={a}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setArea(a)}
                    style={({ pressed }) => ({
                      paddingVertical: 9,
                      paddingHorizontal: 14,
                      borderRadius: radius.pill,
                      backgroundColor: on ? colors.sage : colors.surfaceSolid,
                      borderWidth: 1,
                      borderColor: on ? colors.sage : colors.line,
                      transform: [{ scale: pressed ? 0.96 : 1 }],
                    })}
                  >
                    <Text
                      style={{
                        fontFamily: on ? font.uiBold : font.uiSemi,
                        fontSize: 13,
                        color: on ? '#FFFFFF' : colors.textMuted,
                      }}
                    >
                      {a}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <Button
                variant="glass"
                label={t('Back')}
                icon="arrowLeft"
                iconPosition="left"
                style={{ flex: 1 }}
                onPress={() => setStep(1)}
              />
              <Button
                label={t('Continue')}
                icon="arrowRight"
                style={{ flex: 2 }}
                onPress={next}
              />
            </View>
          </View>
        </Reveal>
      ) : null}

      {/* ---- step 4 · delivery, on the shop's own terms ---- */}
      {step === 3 ? (
        <Reveal delay={2}>
          <View style={{ marginTop: 20 }}>
            <RadiusSlider value={radiusKm} onChange={setRadiusKm} />
            <Body muted size={13} style={{ marginTop: 4, marginBottom: 18 }}>
              {t('How far this shop will deliver.')}
            </Body>

            {/* ---- coverage: the divisions this shop will cross ----
                The slider above is geometry; this is the answer customers
                actually match against. Set any coverage and the radius stops
                being consulted. */}
            <View style={{ marginBottom: 22 }}>
              <ServiceAreaPicker value={coverage} onChange={setCoverage} />
            </View>

            {/* Two prices: inside the shop's own division, and everywhere
                else. The division comes from the shop's own map pin. */}
            <DeliveryFees
              home={home}
              onHome={(d) => {
                setHome(d);
                setErrors({});
              }}
              inside={feeInside}
              onInside={(v) => {
                setFeeInside(v);
                setErrors({});
              }}
              outside={feeOutside}
              onOutside={(v) => {
                setFeeOutside(v);
                setErrors({});
              }}
              lat={pin?.lat}
              lng={pin?.lng}
            />
            <FieldError text={errors.fee} />

            {errors.form ? <FieldError text={errors.form} /> : null}

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <Button
                variant="glass"
                label={t('Back')}
                icon="arrowLeft"
                iconPosition="left"
                style={{ flex: 1 }}
                onPress={() => setStep(2)}
              />
              <Button
                label={saving ? t('Opening…') : t('Open your shop')}
                icon={saving ? undefined : 'check'}
                style={{ flex: 2 }}
                disabled={saving || !kitchen}
                onPress={open}
              />
            </View>
          </View>
        </Reveal>
      ) : null}
    </View>
  );
}
