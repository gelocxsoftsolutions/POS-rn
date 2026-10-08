import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { Card } from "@/components/ui/card";
import {
  CustomerService,
  WALK_IN_LABEL,
  type CustomerSummary,
  type CustomerProfile,
} from "@/lib/services/customer.service";
import { useIsDarkTheme } from "@/lib/stores/ui-store";
import { useCashierStore } from "@/lib/stores/cashier-store";
import { getVisibleCashierIds } from "@/lib/stores/access-settings-store";

const peso = (value: number) => `₱${Number(value ?? 0).toFixed(2)}`;

const AVATAR_TINTS = [
  "#dbeafe",
  "#dcfce7",
  "#fef3c7",
  "#ede9fe",
  "#fce7f3",
  "#ffedd5",
  "#e0f2fe",
  "#fae8ff",
];

function tintFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.floor(diff / 86400000);
}

function daysSinceLabel(iso: string | null): string {
  const days = daysSince(iso);
  if (days === null) return "No purchase";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function recencyColor(iso: string | null): string {
  const days = daysSince(iso);
  if (days === null) return "#94a3b8";
  if (days <= 0) return "#22c55e";
  if (days <= 7) return "#f59e0b";
  return "#94a3b8";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function InsightCard({
  dark,
  tint,
  icon,
  iconColor,
  label,
  value,
  sub,
}: {
  dark: boolean;
  tint: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <View
      style={[
        styles.insightCard,
        { backgroundColor: dark ? "#141922" : tint, borderColor: dark ? "#28303d" : "#00000010" },
      ]}
    >
      <View style={[styles.insightIcon, { backgroundColor: dark ? "#ffffff14" : "#ffffffcc" }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <Text style={[styles.insightLabel, { color: dark ? "#94a3b8" : "#5b6b7f" }]}>{label}</Text>
      <Text
        style={[styles.insightValue, { color: dark ? "#f8fafc" : "#17202b" }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
      >
        {value}
      </Text>
      <Text style={[styles.insightSub, { color: dark ? "#64748b" : "#6b7b8d" }]} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );
}

export default function CustomersScreen() {
  const dark = useIsDarkTheme();
  const session = useCashierStore((s) => s.session);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [walkIn, setWalkIn] = useState<CustomerSummary | null>(null);
  const [topItems, setTopItems] = useState<{ productName: string; quantity: number; revenue: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  // undefined = closed, null = walk-in profile, string = named profile.
  const [profileKey, setProfileKey] = useState<string | null | undefined>(undefined);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const loadCustomers = useCallback(async () => {
    try {
      const cashierIds = getVisibleCashierIds(session?.cashierId);
      const [list, anonymous, items] = await Promise.all([
        CustomerService.list(cashierIds),
        CustomerService.anonymous(cashierIds),
        CustomerService.topItems(cashierIds, 5),
      ]);
      setCustomers(list);
      setWalkIn(anonymous);
      setTopItems(items);
    } catch {
      // keep previous
    }
  }, [session?.cashierId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadCustomers();
      setLoading(false);
    })();
  }, [loadCustomers]);

  useFocusEffect(
    useCallback(() => {
      void loadCustomers();
    }, [loadCustomers])
  );

  const openProfile = useCallback(
    async (key: string | null) => {
      setProfileKey(key);
      setProfile(null);
      setProfileLoading(true);
      try {
        const cashierIds = getVisibleCashierIds(session?.cashierId);
        const result = await CustomerService.profile(key, cashierIds);
        setProfile(result);
      } catch {
        setProfile(null);
      } finally {
        setProfileLoading(false);
      }
    },
    [session?.cashierId]
  );

  const closeProfile = useCallback(() => {
    setProfileKey(undefined);
    setProfile(null);
  }, []);

  const highestSpender = customers.length > 0 ? customers[0] : null;
  const mostOrders =
    customers.length > 0
      ? customers.reduce((best, c) => (c.orders > best.orders ? c : best), customers[0])
      : null;
  const topItem = topItems.length > 0 ? topItems[0] : null;
  const topQty = topItem?.quantity ?? 1;

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = normalizedSearch
    ? customers.filter((c) => c.name.toLowerCase().includes(normalizedSearch))
    : customers;
  const showWalkIn =
    walkIn !== null &&
    (!normalizedSearch || WALK_IN_LABEL.toLowerCase().includes(normalizedSearch) || normalizedSearch.includes("walk"));

  // Grid = 5 columns x 5 rows per page, list = 10 rows per page.
  const pageSize = viewMode === "grid" ? 25 : 10;
  const tiles: { key: string; walkIn: boolean; customer: CustomerSummary }[] = [
    ...(showWalkIn && walkIn ? [{ key: "__walkin__", walkIn: true, customer: walkIn }] : []),
    ...filtered.map((c) => ({ key: c.name, walkIn: false, customer: c })),
  ];
  const totalPages = Math.max(1, Math.ceil(tiles.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedTiles = tiles.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [search, viewMode]);

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(1, Math.ceil(tiles.length / pageSize))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles.length, pageSize]);

  const cardBg = dark ? "#141922" : "#ffffff";
  const cardBorder = dark ? "#28303d" : "#e6ebf2";
  const titleColor = dark ? "#f8fafc" : "#17202b";
  const descColor = dark ? "#94a3b8" : "#6b7b8d";
  const rowBorder = dark ? "#1e293b" : "#eef2f7";
  const inputBg = dark ? "#141922" : "#ffffff";
  const inputBorder = dark ? "#28303d" : "#e2e8f0";

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: dark ? "#0b0f16" : "#f2f5f9" }]}>
        <ActivityIndicator size="large" color={dark ? "#60a5fa" : "#17386b"} />
      </View>
    );
  }

  const hasAnyData = customers.length > 0 || walkIn !== null;

  return (
    <View style={[styles.container, { backgroundColor: dark ? "#0b0f16" : "#f2f5f9" }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headerCopy}>
            <Text style={[styles.screenTitle, { color: dark ? "#f5f7fa" : "#151a22" }]}>Customers</Text>
            <Text style={[styles.screenSubtitle, { color: dark ? "#8f99a8" : "#667080" }]}>
              Spending records from completed sales
            </Text>
          </View>
          {hasAnyData && (
            <View style={[styles.countPill, { backgroundColor: dark ? "#1e293b" : "#17386b" }]}>
              <Ionicons name="people" size={14} color="#ffffff" />
              <Text style={styles.countPillText}>{customers.length + (walkIn ? 1 : 0)}</Text>
            </View>
          )}
        </View>

        {!hasAnyData ? (
          <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={styles.emptyBox}>
              <View style={[styles.emptyIcon, { backgroundColor: dark ? "#1e293b" : "#eef4ff" }]}>
                <Ionicons name="people-outline" size={34} color={dark ? "#64748b" : "#9db2cc"} />
              </View>
              <Text style={[styles.emptyTitle, { color: titleColor }]}>No customers yet</Text>
              <Text style={[styles.emptyText, { color: descColor }]}>
                Add a customer name at checkout to start tracking spending, favorites, and visit history.
              </Text>
            </View>
          </Card>
        ) : (
          <>
            {/* Analytics */}
            <Text style={[styles.sectionTitle, { color: titleColor }]}>Insights</Text>
            <View style={styles.insightRow}>
              <InsightCard
                dark={dark}
                tint="#fff7e6"
                icon="trophy"
                iconColor="#d97706"
                label="Highest spender"
                value={highestSpender ? peso(highestSpender.totalSpent) : "—"}
                sub={highestSpender ? `${highestSpender.name} • ${highestSpender.orders} orders` : "No named sales"}
              />
              <InsightCard
                dark={dark}
                tint="#e9f9ef"
                icon="repeat"
                iconColor="#16a34a"
                label="Most orders"
                value={mostOrders ? `${mostOrders.orders} orders` : "—"}
                sub={mostOrders ? `${mostOrders.name} • ${peso(mostOrders.totalSpent)}` : "No named sales"}
              />
              <InsightCard
                dark={dark}
                tint="#f1eafe"
                icon="star"
                iconColor="#7c3aed"
                label="Top item"
                value={topItem ? `${topItem.quantity} sold` : "—"}
                sub={topItem ? `${topItem.productName} • ${peso(topItem.revenue)}` : "No named sales"}
              />
            </View>

            {topItems.length > 0 && (
              <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <View style={styles.cardHeading}>
                  <View>
                    <Text style={[styles.cardTitle, { color: titleColor }]}>Customer favorites</Text>
                    <Text style={[styles.cardDesc, { color: descColor }]}>What named customers buy most.</Text>
                  </View>
                  <View style={[styles.miniBadge, { backgroundColor: dark ? "#1e293b" : "#eef4ff" }]}>
                    <Ionicons name="heart" size={13} color="#e11d48" />
                  </View>
                </View>
                {topItems.map((item, index) => (
                  <View
                    key={`${item.productName}-${index}`}
                    style={[
                      styles.favRow,
                      { borderBottomColor: rowBorder },
                      index === topItems.length - 1 && styles.rowLast,
                    ]}
                  >
                    <View style={styles.favMain}>
                      <View style={styles.favTop}>
                        <View style={[styles.rankBadge, { backgroundColor: dark ? "#1e293b" : "#17386b" }]}>
                          <Text style={styles.rankText}>{index + 1}</Text>
                        </View>
                        <Text style={[styles.itemName, { color: titleColor }]} numberOfLines={1}>
                          {item.productName}
                        </Text>
                        <Text style={[styles.favQty, { color: dark ? "#93c5fd" : "#17386b" }]}>
                          {item.quantity}×
                        </Text>
                      </View>
                      <View style={[styles.favTrack, { backgroundColor: dark ? "#1e293b" : "#eef2f7" }]}>
                        <View
                          style={[
                            styles.favFill,
                            { width: `${Math.max(4, Math.round((item.quantity / topQty) * 100))}%` },
                          ]}
                        />
                      </View>
                      <Text style={[styles.itemMeta, { color: descColor }]}>{peso(item.revenue)} revenue</Text>
                    </View>
                  </View>
                ))}
              </Card>
            )}

            {/* All customers */}
            <View style={styles.listHeading}>
              <Text style={[styles.sectionTitle, { color: titleColor, marginBottom: 0 }]}>All customers</Text>
              <View style={styles.listHeadingRight}>
                {walkIn && (
                  <View style={[styles.walkInTag, { backgroundColor: dark ? "#1e293b" : "#eef4ff" }]}>
                    <Text style={[styles.walkInTagText, { color: dark ? "#93c5fd" : "#17386b" }]}>
                      incl. no-name sales
                    </Text>
                  </View>
                )}
                <View style={[styles.viewToggle, { backgroundColor: dark ? "#18202c" : "#e8edf3" }]}>
                  <TouchableOpacity
                    style={[styles.viewToggleButton, viewMode === "grid" && styles.viewToggleButtonActive]}
                    onPress={() => setViewMode("grid")}
                    accessibilityLabel="Grid view"
                  >
                    <Ionicons name="grid" size={16} color={viewMode === "grid" ? "#ffffff" : dark ? "#94a3b8" : "#64748b"} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.viewToggleButton, viewMode === "list" && styles.viewToggleButtonActive]}
                    onPress={() => setViewMode("list")}
                    accessibilityLabel="List view"
                  >
                    <Ionicons name="list" size={17} color={viewMode === "list" ? "#ffffff" : dark ? "#94a3b8" : "#64748b"} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <View style={[styles.searchBar, { backgroundColor: inputBg, borderColor: inputBorder }]}>
              <Ionicons name="search" size={18} color={dark ? "#64748b" : "#8e99a4"} />
              <TextInput
                style={[styles.searchInput, { color: titleColor }]}
                placeholder="Search customers..."
                placeholderTextColor={dark ? "#64748b" : "#9aa4b2"}
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")} accessibilityLabel="Clear search">
                  <Ionicons name="close-circle" size={18} color={dark ? "#64748b" : "#8e99a4"} />
                </TouchableOpacity>
              )}
            </View>

            {pagedTiles.length === 0 ? (
              <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <Text style={[styles.emptyText, { color: descColor, textAlign: "center" }]}>
                  No customers match your search.
                </Text>
              </Card>
            ) : viewMode === "grid" ? (
              <View style={styles.grid}>
                {pagedTiles.map((tile) =>
                  tile.walkIn ? (
                    <TouchableOpacity
                      key={tile.key}
                      style={[styles.tile, styles.walkInTile, { backgroundColor: cardBg, borderColor: cardBorder }]}
                      onPress={() => void openProfile(null)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.tileAvatar, { backgroundColor: dark ? "#1e293b" : "#e8edf3" }]}>
                        <Ionicons name="bag-handle-outline" size={18} color={dark ? "#94a3b8" : "#5b6b7f"} />
                      </View>
                      <Text style={[styles.tileName, { color: titleColor }]} numberOfLines={1}>
                        {WALK_IN_LABEL}
                      </Text>
                      <Text style={[styles.tileMeta, { color: descColor }]} numberOfLines={1}>
                        {tile.customer.orders} sale{tile.customer.orders === 1 ? "" : "s"}
                      </Text>
                      <Text style={[styles.tileTotal, { color: titleColor }]} numberOfLines={1}>
                        {peso(tile.customer.totalSpent)}
                      </Text>
                      <View style={styles.tileFoot}>
                        <View style={[styles.dot, { backgroundColor: recencyColor(tile.customer.lastPurchase) }]} />
                        <Text style={[styles.tileSeen, { color: descColor }]} numberOfLines={1}>
                          {daysSinceLabel(tile.customer.lastPurchase)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      key={tile.key}
                      style={[styles.tile, { backgroundColor: cardBg, borderColor: cardBorder }]}
                      onPress={() => void openProfile(tile.customer.name)}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.tileAvatar, { backgroundColor: tintFor(tile.customer.name) }]}>
                        <Text style={styles.tileAvatarText}>{initials(tile.customer.name)}</Text>
                      </View>
                      <Text style={[styles.tileName, { color: titleColor }]} numberOfLines={1}>
                        {tile.customer.name}
                      </Text>
                      <Text style={[styles.tileMeta, { color: descColor }]} numberOfLines={1}>
                        {tile.customer.orders} order{tile.customer.orders === 1 ? "" : "s"}
                      </Text>
                      <Text style={[styles.tileTotal, { color: titleColor }]} numberOfLines={1}>
                        {peso(tile.customer.totalSpent)}
                      </Text>
                      <View style={styles.tileFoot}>
                        <View style={[styles.dot, { backgroundColor: recencyColor(tile.customer.lastPurchase) }]} />
                        <Text style={[styles.tileSeen, { color: descColor }]} numberOfLines={1}>
                          {daysSinceLabel(tile.customer.lastPurchase)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )
                )}
              </View>
            ) : (
              <View style={[styles.listCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                {pagedTiles.map((tile, index) => (
                  <TouchableOpacity
                    key={tile.key}
                    style={[
                      styles.listRow,
                      { borderBottomColor: rowBorder },
                      index === pagedTiles.length - 1 && styles.rowLast,
                    ]}
                    onPress={() => void openProfile(tile.walkIn ? null : tile.customer.name)}
                    activeOpacity={0.7}
                  >
                    {tile.walkIn ? (
                      <View style={[styles.listAvatar, { backgroundColor: dark ? "#1e293b" : "#e8edf3" }]}>
                        <Ionicons name="bag-handle-outline" size={20} color={dark ? "#94a3b8" : "#5b6b7f"} />
                      </View>
                    ) : (
                      <View style={[styles.listAvatar, { backgroundColor: tintFor(tile.customer.name) }]}>
                        <Text style={styles.tileAvatarText}>{initials(tile.customer.name)}</Text>
                      </View>
                    )}
                    <View style={styles.itemInfo}>
                      <View style={styles.listNameRow}>
                        <Text style={[styles.itemName, { color: titleColor }]} numberOfLines={1}>
                          {tile.walkIn ? WALK_IN_LABEL : tile.customer.name}
                        </Text>
                        {tile.walkIn && (
                          <View style={[styles.noNameTag, { backgroundColor: dark ? "#1e293b" : "#eef0f4" }]}>
                            <Text style={[styles.noNameTagText, { color: descColor }]}>NO NAME</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.itemMeta, { color: descColor }]}>
                        {tile.customer.orders} order{tile.customer.orders === 1 ? "" : "s"} • {peso(tile.customer.totalSpent)}
                      </Text>
                    </View>
                    <View style={styles.listRight}>
                      <View style={[styles.dot, { backgroundColor: recencyColor(tile.customer.lastPurchase) }]} />
                      <Text style={[styles.tileSeen, { color: descColor }]}>
                        {daysSinceLabel(tile.customer.lastPurchase)}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={dark ? "#64748b" : "#94a3b8"} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {totalPages > 1 && (
              <View style={styles.pager}>
                <TouchableOpacity
                  style={[
                    styles.pagerButton,
                    { backgroundColor: cardBg, borderColor: cardBorder },
                    safePage === 1 && styles.pagerButtonDisabled,
                  ]}
                  onPress={() => setPage(Math.max(1, safePage - 1))}
                  disabled={safePage === 1}
                  accessibilityLabel="Previous page"
                >
                  <Ionicons name="chevron-back" size={16} color={dark ? "#e2e8f0" : "#17386b"} />
                </TouchableOpacity>
                <Text style={[styles.pagerText, { color: descColor }]}>
                  Page {safePage} of {totalPages} • {viewMode === "grid" ? "5 × 5 grid" : "10 per page"}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.pagerButton,
                    { backgroundColor: cardBg, borderColor: cardBorder },
                    safePage === totalPages && styles.pagerButtonDisabled,
                  ]}
                  onPress={() => setPage(Math.min(totalPages, safePage + 1))}
                  disabled={safePage === totalPages}
                  accessibilityLabel="Next page"
                >
                  <Ionicons name="chevron-forward" size={16} color={dark ? "#e2e8f0" : "#17386b"} />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Customer profile */}
      <Modal visible={profileKey !== undefined} animationType="slide" onRequestClose={closeProfile}>
        <View style={[styles.profileContainer, { backgroundColor: dark ? "#0b0f16" : "#f2f5f9" }]}>
          <View style={[styles.profileHeader, { backgroundColor: cardBg, borderBottomColor: cardBorder }]}>
            <View style={styles.profileHeading}>
              <Text style={[styles.profileTitle, { color: titleColor }]} numberOfLines={1}>
                {profile?.name ?? (profileKey === null ? WALK_IN_LABEL : (profileKey ?? ""))}
              </Text>
              <Text style={[styles.profileSubtitle, { color: descColor }]}>
                {profileKey === null ? "Sales without a customer name" : "Customer profile"}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.profileClose, { backgroundColor: dark ? "#1e293b" : "#eef4ff" }]}
              onPress={closeProfile}
              accessibilityLabel="Close profile"
            >
              <Ionicons name="close" size={20} color={dark ? "#cbd5e1" : "#17386b"} />
            </TouchableOpacity>
          </View>
          {profileLoading || !profile ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={dark ? "#60a5fa" : "#17386b"} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={[styles.profileHero, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <View
                  style={[
                    styles.heroAvatar,
                    {
                      backgroundColor:
                        profileKey === null ? (dark ? "#1e293b" : "#e8edf3") : tintFor(profile.name),
                    },
                  ]}
                >
                  {profileKey === null ? (
                    <Ionicons name="bag-handle-outline" size={30} color={dark ? "#94a3b8" : "#5b6b7f"} />
                  ) : (
                    <Text style={styles.heroAvatarText}>{initials(profile.name)}</Text>
                  )}
                </View>
                <Text style={[styles.heroName, { color: titleColor }]} numberOfLines={1}>
                  {profile.name}
                </Text>
                <Text style={[styles.heroMeta, { color: descColor }]}>
                  {profile.orders} order{profile.orders === 1 ? "" : "s"} • {peso(profile.totalSpent)} total •{" "}
                  {daysSinceLabel(profile.lastPurchase)}
                </Text>
              </View>

              <View style={styles.statGrid}>
                {[
                  { label: "Total spending", value: peso(profile.totalSpent), sub: `${profile.orders} orders` },
                  { label: "Last purchased", value: daysSinceLabel(profile.lastPurchase), sub: formatDate(profile.lastPurchase) },
                  { label: "This week", value: peso(profile.weeklySpent), sub: `${profile.weeklyOrders} orders` },
                  { label: "This month", value: peso(profile.monthlySpent), sub: `${profile.monthlyOrders} orders` },
                ].map((stat) => (
                  <Card key={stat.label} style={[styles.statCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <Text style={[styles.statLabel, { color: descColor }]}>{stat.label}</Text>
                    <Text style={[styles.statValue, { color: titleColor }]} numberOfLines={1}>
                      {stat.value}
                    </Text>
                    <Text style={[styles.statSub, { color: descColor }]} numberOfLines={1}>
                      {stat.sub}
                    </Text>
                  </Card>
                ))}
              </View>

              <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <Text style={[styles.cardTitle, { color: titleColor }]}>Usually orders</Text>
                <Text style={[styles.cardDesc, { color: descColor }]}>Items bought the most.</Text>
                {profile.topItems.length === 0 ? (
                  <Text style={[styles.emptyText, { color: descColor }]}>No item history.</Text>
                ) : (
                  profile.topItems.map((item, index) => (
                    <View
                      key={`${item.productName}-${index}`}
                      style={[
                        styles.itemRow,
                        { borderBottomColor: rowBorder },
                        index === profile.topItems.length - 1 && styles.rowLast,
                      ]}
                    >
                      <View style={styles.itemInfo}>
                        <Text style={[styles.itemName, { color: titleColor }]} numberOfLines={1}>
                          {item.productName}
                        </Text>
                        <Text style={[styles.itemMeta, { color: descColor }]}>
                          {item.quantity}× • {peso(item.revenue)}
                        </Text>
                      </View>
                    </View>
                  ))
                )}
              </Card>

              <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <Text style={[styles.cardTitle, { color: titleColor }]}>Recent purchases</Text>
                <Text style={[styles.cardDesc, { color: descColor }]}>Latest completed sales.</Text>
                {profile.recentSales.length === 0 ? (
                  <Text style={[styles.emptyText, { color: descColor }]}>No purchases found.</Text>
                ) : (
                  profile.recentSales.map((sale, index) => (
                    <View
                      key={sale.id}
                      style={[
                        styles.itemRow,
                        { borderBottomColor: rowBorder },
                        index === profile.recentSales.length - 1 && styles.rowLast,
                      ]}
                    >
                      <View style={styles.itemInfo}>
                        <Text style={[styles.itemName, { color: titleColor }]} numberOfLines={1}>
                          {sale.receiptNumber}
                        </Text>
                        <Text style={[styles.itemMeta, { color: descColor }]}>
                          {formatDateTime(sale.createdAt)} • {sale.itemCount} item{sale.itemCount === 1 ? "" : "s"}
                        </Text>
                      </View>
                      <Text style={[styles.saleTotal, { color: titleColor }]}>{peso(sale.total)}</Text>
                    </View>
                  ))
                )}
              </Card>

              <Card style={[styles.section, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <Text style={[styles.cardTitle, { color: titleColor }]}>Return & refund history</Text>
                <Text style={[styles.cardDesc, { color: descColor }]}>Sales marked returned, refunded, or cancelled.</Text>
                {profile.refunds.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Ionicons name="checkmark-circle-outline" size={28} color="#16a34a" />
                    <Text style={[styles.emptyText, { color: descColor }]}>
                      No returns or refunds recorded{profileKey === null ? " for walk-in sales" : " for this customer"}.
                    </Text>
                  </View>
                ) : (
                  profile.refunds.map((sale, index) => (
                    <View
                      key={sale.id}
                      style={[
                        styles.itemRow,
                        { borderBottomColor: rowBorder },
                        index === profile.refunds.length - 1 && styles.rowLast,
                      ]}
                    >
                      <View style={styles.itemInfo}>
                        <Text style={[styles.itemName, { color: titleColor }]} numberOfLines={1}>
                          {sale.receiptNumber} • {sale.status}
                        </Text>
                        <Text style={[styles.itemMeta, { color: descColor }]}>{formatDateTime(sale.createdAt)}</Text>
                      </View>
                      <Text style={[styles.saleTotal, { color: "#dc3545" }]}>{peso(sale.total)}</Text>
                    </View>
                  ))
                )}
              </Card>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  headerCopy: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  screenSubtitle: {
    fontSize: 12,
    marginTop: 4,
  },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 4,
  },
  countPillText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  section: {
    padding: 16,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  cardHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  cardDesc: {
    fontSize: 11,
    marginTop: 2,
    marginBottom: 10,
  },
  miniBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  insightRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  insightCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  insightIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  insightLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  insightValue: {
    fontSize: 18,
    fontWeight: "800",
    marginTop: 3,
    letterSpacing: -0.3,
  },
  insightSub: {
    fontSize: 11,
    marginTop: 3,
  },
  favRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  favMain: {
    gap: 7,
  },
  favTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rankText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff",
  },
  itemName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
  },
  favQty: {
    fontSize: 13,
    fontWeight: "800",
    flexShrink: 0,
  },
  favTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  favFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: "#17386b",
  },
  itemMeta: {
    fontSize: 11,
    marginTop: 1,
  },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  listHeadingRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  viewToggle: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  viewToggleButton: {
    width: 32,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  viewToggleButtonActive: {
    backgroundColor: "#17386b",
  },
  walkInTag: {
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  walkInTagText: {
    fontSize: 10,
    fontWeight: "700",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 14,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 14,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tile: {
    width: "18%",
    minWidth: 0,
    borderRadius: 14,
    borderWidth: 1,
    padding: 8,
    alignItems: "center",
    gap: 2,
  },
  walkInTile: {
    borderStyle: "dashed",
  },
  tileAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 5,
  },
  tileAvatarText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#17202b",
  },
  noNameTag: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  noNameTagText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  tileName: {
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
  },
  tileMeta: {
    fontSize: 9,
    textAlign: "center",
  },
  tileTotal: {
    fontSize: 13,
    fontWeight: "800",
    marginTop: 3,
    letterSpacing: -0.2,
    textAlign: "center",
  },
  tileFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  tileSeen: {
    fontSize: 9,
    fontWeight: "600",
  },
  listCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  listAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  listNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  listRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 12,
  },
  pagerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pagerButtonDisabled: {
    opacity: 0.35,
  },
  pagerText: {
    fontSize: 12,
    fontWeight: "600",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  rowLast: {
    borderBottomWidth: 0,
    paddingBottom: 2,
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
  },
  saleTotal: {
    fontSize: 13,
    fontWeight: "700",
    flexShrink: 0,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 10,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  emptyText: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  profileContainer: {
    flex: 1,
    paddingTop: 48,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  profileHeading: {
    flex: 1,
    minWidth: 0,
  },
  profileTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  profileSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  profileClose: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  profileHero: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  heroAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  heroAvatarText: {
    fontSize: 24,
    fontWeight: "800",
    color: "#17202b",
  },
  heroName: {
    fontSize: 18,
    fontWeight: "800",
  },
  heroMeta: {
    fontSize: 12,
    marginTop: 4,
  },
  statGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    width: "48%",
    flexGrow: 1,
    padding: 13,
    borderRadius: 16,
    borderWidth: 1,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statValue: {
    fontSize: 17,
    fontWeight: "800",
    marginTop: 4,
  },
  statSub: {
    fontSize: 11,
    marginTop: 2,
  },
});
