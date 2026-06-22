import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, FlatList, Pressable, Alert, ActivityIndicator,
} from 'react-native';
import type { Annotation } from '../types';
import { reanchorAll } from '../utils/reanchor';
import { updateAnnotationAnchor, deleteAnnotations } from '../services/db';

interface Props {
  annotations: Annotation[];          // orphaned annotations
  currentContent: string;             // new article HTML
  currentHash: string;                // hash of new content
  onResolved: (ids: number[]) => void; // IDs that were re-anchored or deleted
  onDismiss: () => void;
}

export default function OrphanedAnnotationsBanner({
  annotations, currentContent, currentHash, onResolved, onDismiss,
}: Props) {
  const [showSheet, setShowSheet] = useState(false);
  const [reanchoring, setReanchoring] = useState(false);
  const [localAnns, setLocalAnns] = useState(annotations);
  const count = localAnns.length;

  const handleReanchorAll = async () => {
    setReanchoring(true);
    const results = reanchorAll(localAnns, currentContent);
    const succeeded = results.filter(r => r.found);
    const failed = results.filter(r => !r.found);

    // Persist re-anchored annotations
    await Promise.all(
      succeeded.map(r => updateAnnotationAnchor(r.id, r.newText, currentHash))
    );

    const successIds = succeeded.map(r => r.id);
    onResolved(successIds);
    setLocalAnns(prev => prev.filter(a => !successIds.includes(a.id)));

    const msg =
      succeeded.length === results.length
        ? `All ${succeeded.length} highlight${succeeded.length > 1 ? 's' : ''} re-anchored to the new version.`
        : `${succeeded.length} re-anchored. ${failed.length} could not be found in the new version.`;
    Alert.alert('Re-anchor complete', msg);
    setReanchoring(false);
    if (failed.length === 0) setShowSheet(false);
  };

  const handleDeleteAll = () => {
    Alert.alert(
      `Delete ${count} orphaned highlight${count > 1 ? 's' : ''}?`,
      'These no longer match the current article text.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All', style: 'destructive',
          onPress: async () => {
            const ids = localAnns.map(a => a.id);
            await deleteAnnotations(ids);
            onResolved(ids);
            setLocalAnns([]);
            setShowSheet(false);
          },
        },
      ]
    );
  };

  const handleDeleteOne = async (id: number) => {
    await deleteAnnotations([id]);
    onResolved([id]);
    setLocalAnns(prev => prev.filter(a => a.id !== id));
    if (localAnns.length === 1) setShowSheet(false);
  };

  if (count === 0) return null;

  return (
    <>
      <TouchableOpacity style={styles.banner} onPress={() => setShowSheet(true)} activeOpacity={0.8}>
        <Text style={styles.bannerIcon}>⚠</Text>
        <Text style={styles.bannerText}>
          {count} highlight{count > 1 ? 's' : ''} from a previous version
        </Text>
        <Text style={styles.bannerReview}>Review</Text>
      </TouchableOpacity>

      <Modal
        visible={showSheet}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSheet(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setShowSheet(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Previous version highlights</Text>
            <Text style={styles.sheetSub}>
              These no longer match the current article text. You can try to re-anchor them automatically, or delete them.
            </Text>
          </View>

          <FlatList
            data={localAnns}
            keyExtractor={i => String(i.id)}
            style={styles.list}
            renderItem={({ item }) => (
              <View style={[styles.annRow, { borderLeftColor: item.color }]}>
                <View style={styles.annContent}>
                  <Text style={styles.annText} numberOfLines={3}>"{item.selected_text}"</Text>
                  {item.note && <Text style={styles.annNote}>{item.note}</Text>}
                </View>
                <TouchableOpacity
                  style={styles.deleteOne}
                  onPress={() => handleDeleteOne(item.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.deleteOneText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.allResolved}>All highlights resolved.</Text>
            }
          />

          <View style={styles.sheetActions}>
            <TouchableOpacity style={styles.dismissBtn} onPress={() => { setShowSheet(false); onDismiss(); }}>
              <Text style={styles.dismissBtnText}>Keep for now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reanchorBtn} onPress={handleReanchorAll} disabled={reanchoring}>
              {reanchoring
                ? <ActivityIndicator color="#7ba4ff" size="small" />
                : <Text style={styles.reanchorBtnText}>Re-anchor ✦</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteAllBtn} onPress={handleDeleteAll}>
              <Text style={styles.deleteAllBtnText}>Delete all</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#2a1f00',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#FFE56633',
    paddingHorizontal: 14, paddingVertical: 9, gap: 8,
  },
  bannerIcon: { fontSize: 13, color: '#FFE566' },
  bannerText: { flex: 1, color: '#c8a800', fontSize: 13 },
  bannerReview: { color: '#FFE566', fontSize: 13, fontWeight: '600' },

  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#1c1c1e',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#3a3a3c',
    maxHeight: '72%',
  },
  sheetHeader: {
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2a2a2a',
  },
  sheetTitle: { color: '#e8e8e8', fontSize: 16, fontWeight: '600', marginBottom: 6 },
  sheetSub: { color: '#666', fontSize: 13, lineHeight: 18 },

  list: { maxHeight: 280 },
  annRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingVertical: 12,
    borderLeftWidth: 3, marginLeft: 16, marginTop: 10, gap: 10,
  },
  annContent: { flex: 1 },
  annText: { color: '#888', fontSize: 13, lineHeight: 18, fontStyle: 'italic' },
  annNote: { color: '#555', fontSize: 12, marginTop: 4 },
  deleteOne: { paddingLeft: 8 },
  deleteOneText: { color: '#555', fontSize: 15 },
  allResolved: { color: '#444', fontSize: 14, textAlign: 'center', padding: 32 },

  sheetActions: {
    flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2a2a2a',
  },
  dismissBtn: {
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: '#2c2c2e', alignItems: 'center',
  },
  dismissBtnText: { color: '#888', fontSize: 14 },
  reanchorBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#1a2a40', alignItems: 'center', justifyContent: 'center',
  },
  reanchorBtnText: { color: '#7ba4ff', fontSize: 14, fontWeight: '600' },
  deleteAllBtn: {
    paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: '#3a0000', alignItems: 'center',
  },
  deleteAllBtnText: { color: '#FF6B6B', fontSize: 14 },
});
