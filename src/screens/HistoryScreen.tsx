import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { getSessions } from '../services/db';
import type { Session, ReadNode } from '../types';
import type { RootStackParamList } from '../../App';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const [sessions, setSessions] = useState<Session[]>([]);

  useFocusEffect(useCallback(() => {
    getSessions(40).then(setSessions);
  }, []));

  const open = (slug: string, title: string) =>
    nav.navigate('Article', { slug, title });

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity
          style={styles.back}
          onPress={() => nav.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backChevron}>‹</Text>
          <Text style={styles.backLabel}>Library</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Journey</Text>
        <View style={styles.back} />
      </View>

      {sessions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            Your reading journey will appear here.{'\n'}
            Start by opening an article.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          {sessions.map(session => (
            <SessionBlock key={session.session_id} session={session} onOpen={open} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function SessionBlock({
  session,
  onOpen,
}: {
  session: Session;
  onOpen: (slug: string, title: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const label = formatSessionDate(session.started_at);
  const duration = formatDuration(session);

  return (
    <View style={styles.session}>
      <TouchableOpacity
        style={styles.sessionHeader}
        onPress={() => setCollapsed(c => !c)}
        activeOpacity={0.7}
      >
        <View style={styles.sessionDot} />
        <View style={styles.sessionMeta}>
          <Text style={styles.sessionDate}>{label}</Text>
          <Text style={styles.sessionStats}>
            {session.total} {session.total === 1 ? 'article' : 'articles'}
            {duration ? ` · ${duration}` : ''}
          </Text>
        </View>
        <Text style={styles.chevron}>{collapsed ? '›' : '⌄'}</Text>
      </TouchableOpacity>

      {!collapsed && (
        <View style={styles.tree}>
          {session.roots.map(node => (
            <TreeNode key={node.id} node={node} onOpen={onOpen} />
          ))}
        </View>
      )}
    </View>
  );
}

function TreeNode({
  node,
  onOpen,
}: {
  node: ReadNode;
  onOpen: (slug: string, title: string) => void;
}) {
  const hasChildren = node.children.length > 0;

  return (
    <View style={[styles.nodeWrap, { marginLeft: node.depth * 20 }]}>
      {/* Connector line from parent */}
      {node.depth > 0 && <View style={styles.connectorH} />}

      <View style={styles.nodeRow}>
        {/* Vertical line continuing down for children */}
        {hasChildren && <View style={styles.connectorV} />}

        <TouchableOpacity
          style={styles.nodePill}
          onPress={() => onOpen(node.slug, node.title)}
          activeOpacity={0.6}
        >
          <Text style={styles.nodeTitle} numberOfLines={2}>{node.title}</Text>
          <Text style={styles.nodeTime}>{formatRelative(node.visited_at)}</Text>
        </TouchableOpacity>
      </View>

      {hasChildren && (
        <View>
          {node.children.map(child => (
            <TreeNode key={child.id} node={child} onOpen={onOpen} />
          ))}
        </View>
      )}
    </View>
  );
}

// ── Formatting ───────────────────────────────────────────────────────────────

function formatSessionDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isYesterday =
    d.toDateString() === new Date(Date.now() - 86400000).toDateString();

  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${time}`;
}

function formatDuration(session: Session): string {
  if (session.roots.length === 0) return '';
  // Find latest visited_at across all nodes
  let latest = session.started_at;
  function walk(nodes: ReadNode[]) {
    for (const n of nodes) {
      if (n.visited_at > latest) latest = n.visited_at;
      walk(n.children);
    }
  }
  walk(session.roots);
  const mins = Math.round((latest - session.started_at) / 60000);
  if (mins < 1) return '';
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#121212' },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 8,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
    minHeight: 44,
  },
  back: { flexDirection: 'row', alignItems: 'center', minWidth: 80, paddingHorizontal: 8 },
  backChevron: { color: '#7ba4ff', fontSize: 28, lineHeight: 28, marginRight: 1 },
  backLabel: { color: '#7ba4ff', fontSize: 16 },
  headerTitle: { flex: 1, color: '#e8e8e8', fontSize: 15, fontWeight: '600', textAlign: 'center' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyText: { color: '#444', fontSize: 15, lineHeight: 22, textAlign: 'center' },

  session: {
    marginTop: 24,
    marginHorizontal: 16,
    borderLeftWidth: 1,
    borderLeftColor: '#222',
    paddingLeft: 12,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 10,
  },
  sessionDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#7ba4ff',
    marginLeft: -16,
  },
  sessionMeta: { flex: 1 },
  sessionDate: { color: '#c0c0c0', fontSize: 13, fontWeight: '600' },
  sessionStats: { color: '#555', fontSize: 11, marginTop: 1 },
  chevron: { color: '#444', fontSize: 16 },

  tree: { paddingBottom: 4 },

  nodeWrap: { marginTop: 6 },
  nodeRow: { flexDirection: 'row', alignItems: 'flex-start' },
  connectorH: {
    position: 'absolute',
    left: -20,
    top: 14,
    width: 14,
    height: 1,
    backgroundColor: '#2a2a2a',
  },
  connectorV: {
    position: 'absolute',
    left: -6,
    top: 28,
    bottom: -6,
    width: 1,
    backgroundColor: '#2a2a2a',
  },
  nodePill: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2a2a2a',
  },
  nodeTitle: { color: '#d6d6d6', fontSize: 14, lineHeight: 19 },
  nodeTime: { color: '#444', fontSize: 11, marginTop: 3 },
});
