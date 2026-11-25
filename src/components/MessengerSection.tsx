import React, { useState, useEffect, useRef } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import {
  MessageSquare,
  Users,
  Lock,
  Globe,
  Send,
  Plus,
  LogIn,
  LogOut,
  MapPin,
  Search,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  ArrowRight,
  Compass,
  Trash2,
  KeyRound,
  Copy,
  Check,
  Edit3,
  Shield,
} from 'lucide-react';
import { db, OperationType, handleFirestoreError } from '../firebase';
import type { SeaRegion } from '../utils/geo';
import {
  BEGINNER_CHAT_PROMPTS,
  DEFAULT_OPEN_ROOMS,
  MAX_DISPLAY_NAME_LEN,
  MAX_PHOTO_URL_LEN,
  MAX_PREVIEW_LEN,
  MAX_SPOT_NAME_LEN,
  ROOM_HIDDEN_PREVIEW_TEXT,
  ROOM_UPDATED_STATUS_TEXT,
  buildDmThreadId,
  canDeleteDmMessage,
  canDeleteRoom,
  canDeleteRoomMessage,
  canReadRoomMessages,
  generateInviteCode,
  maskProfanityText,
  sanitizeAndMaskMessageText,
  sortParticipantPair,
  truncateToLength,
  validateNewOpenRoomInput,
  validatePrivateInviteCode,
} from '../utils/messenger';

interface PublicProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  favoriteRegion: '전체' | SeaRegion;
  isDiscoverable: boolean;
  nicknameSet?: boolean;
}

interface OpenRoom {
  roomId: string;
  title: string;
  region: '전체' | SeaRegion;
  description: string;
  isPublic: boolean;
  inviteCode?: string;
  createdBy: string;
  creatorName: string;
  lastMessageText: string;
  lastMessageAt?: Timestamp | null;
}

interface OpenRoomMember {
  roomId: string;
  uid: string;
  displayName: string;
  photoURL: string;
  inviteCode?: string;
}

interface OpenRoomMessage {
  id: string;
  roomId: string;
  isPublic: boolean;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  text: string;
  sharedSpotName: string;
  createdAt?: Timestamp | null;
}

interface DmThread {
  threadId: string;
  user1Uid: string;
  user1Name: string;
  user1Photo: string;
  user2Uid: string;
  user2Name: string;
  user2Photo: string;
  participantUids: string[];
  lastMessageText: string;
  lastMessageAt?: Timestamp | null;
}

interface DmMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  text: string;
  sharedSpotName: string;
  createdAt?: Timestamp | null;
}

interface UserRoomLink {
  roomId: string;
  uid: string;
  title: string;
  region: '전체' | SeaRegion;
  isPublic?: boolean;
  inviteCode: string;
}

interface MessengerErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class MessengerErrorBoundary extends React.Component<
  { children: React.ReactNode },
  MessengerErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): MessengerErrorBoundaryState {
    return { hasError: true, message: error.message || '메신저 오류' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-950/60 border border-red-500/40 rounded-2xl p-6 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-[#E63946] mx-auto" />
          <h4 className="text-base font-bold text-white">메신저 연결 중 문제가 발생했습니다</h4>
          <p className="text-xs text-red-200 break-all">{this.state.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="min-h-[40px] px-4 py-2 btn-cyan-gradient rounded-xl text-xs font-bold"
          >
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface MessengerSectionProps {
  currentUser: User | null;
  userNickname: string;
  nicknameSet: boolean;
  onOpenNicknameModal: () => void;
  authLoading: boolean;
  authError: string | null;
  onGoogleLogin: () => void;
  onGoogleLogout: () => void;
  activeSpotLabel: string;
  activeRegion: SeaRegion;
  prefilledShareSpot: string | null;
  onClearPrefilledShareSpot: () => void;
}

function formatMessageTime(ts?: Timestamp | null): string {
  if (!ts || typeof ts.toDate !== 'function') return '전송 중';
  return ts.toDate().toLocaleTimeString('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getMessageSortTimeMs(msg: { id: string; createdAt?: Timestamp | null }): number {
  if (msg.createdAt && typeof msg.createdAt.toMillis === 'function') {
    return msg.createdAt.toMillis();
  }
  const parts = msg.id.split('_');
  const parsed = Number(parts[1]);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function MessengerContent({
  currentUser,
  userNickname,
  nicknameSet,
  onOpenNicknameModal,
  authLoading,
  authError,
  onGoogleLogin,
  onGoogleLogout,
  activeSpotLabel,
  activeRegion,
  prefilledShareSpot,
  onClearPrefilledShareSpot,
}: MessengerSectionProps) {
  const [chatMode, setChatMode] = useState<'open' | 'dm'>('open');
  const [roomVisibilityFilter, setRoomVisibilityFilter] = useState<'all' | 'public' | 'private'>('all');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [favoriteRegion, setFavoriteRegion] = useState<'전체' | SeaRegion>(activeRegion);

  // Room collections merged from public, created, and joined private links
  const [publicRoomsList, setPublicRoomsList] = useState<OpenRoom[]>([]);
  const [createdRoomsList, setCreatedRoomsList] = useState<OpenRoom[]>([]);
  const [linkedPrivateRoomsMap, setLinkedPrivateRoomsMap] = useState<Record<string, OpenRoom>>({});
  const [joinedRoomLinks, setJoinedRoomLinks] = useState<UserRoomLink[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [roomMembers, setRoomMembers] = useState<OpenRoomMember[]>([]);
  const [roomMessages, setRoomMessages] = useState<OpenRoomMessage[]>([]);
  const [openMessageText, setOpenMessageText] = useState('');
  const [attachSpotToOpen, setAttachSpotToOpen] = useState(false);

  // Create room & Join private room states
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [newRoomRegion, setNewRoomRegion] = useState<'전체' | SeaRegion>('전체');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [newRoomIsPublic, setNewRoomIsPublic] = useState(true);
  const [newRoomInviteCode, setNewRoomInviteCode] = useState(() => generateInviteCode());
  const [privateCodeInput, setPrivateCodeInput] = useState('');
  const [isJoiningByCode, setIsJoiningByCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Room & message deletion / sending states
  const [confirmDeleteRoomId, setConfirmDeleteRoomId] = useState<string | null>(null);
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);
  const [isSendingOpen, setIsSendingOpen] = useState(false);
  const [confirmDeleteRoomMsgId, setConfirmDeleteRoomMsgId] = useState<string | null>(null);
  const [isDeletingRoomMsg, setIsDeletingRoomMsg] = useState(false);

  // DM state
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [dmThreads, setDmThreads] = useState<DmThread[]>([]);
  const [selectedDmPartner, setSelectedDmPartner] = useState<PublicProfile | null>(null);
  const [dmMessages, setDmMessages] = useState<DmMessage[]>([]);
  const [dmMessageText, setDmMessageText] = useState('');
  const [attachSpotToDm, setAttachSpotToDm] = useState(false);
  const [isSendingDm, setIsSendingDm] = useState(false);
  const [confirmDeleteDmThreadId, setConfirmDeleteDmThreadId] = useState<string | null>(null);
  const [isDeletingDm, setIsDeletingDm] = useState(false);
  const [confirmDeleteDmMsgId, setConfirmDeleteDmMsgId] = useState<string | null>(null);
  const [isDeletingDmMsg, setIsDeletingDmMsg] = useState(false);

  const [isJoiningRoomId, setIsJoiningRoomId] = useState<string | null>(null);
  const [optimisticJoinedRoomIds, setOptimisticJoinedRoomIds] = useState<Set<string>>(() => new Set());

  const seededRef = useRef(false);
  const deletingRoomIdRef = useRef<string | null>(null);
  const openMessagesEndRef = useRef<HTMLDivElement | null>(null);
  const dmMessagesEndRef = useRef<HTMLDivElement | null>(null);

  const effectiveNickname = truncateToLength(
    (userNickname || currentUser?.displayName || '').trim() || '바다낚시인',
    MAX_DISPLAY_NAME_LEN
  );

  // Merge public, created (incl. private), and joined private rooms
  const openRooms: OpenRoom[] = React.useMemo(() => {
    const map = new Map<string, OpenRoom>();
    for (const r of publicRoomsList) map.set(r.roomId, r);
    for (const r of createdRoomsList) map.set(r.roomId, r);
    for (const r of Object.values(linkedPrivateRoomsMap)) map.set(r.roomId, r);

    const list = Array.from(map.values());
    list.sort((a, b) => {
      const tA = a.lastMessageAt?.toMillis?.() ?? 0;
      const tB = b.lastMessageAt?.toMillis?.() ?? 0;
      return tB - tA;
    });
    return list;
  }, [publicRoomsList, createdRoomsList, linkedPrivateRoomsMap]);

  const visibleRooms = React.useMemo(() => {
    if (roomVisibilityFilter === 'public') return openRooms.filter((r) => r.isPublic);
    if (roomVisibilityFilter === 'private') return openRooms.filter((r) => !r.isPublic);
    return openRooms;
  }, [openRooms, roomVisibilityFilter]);

  const joinedRoomIds = React.useMemo(() => {
    const ids = new Set<string>(joinedRoomLinks.map((l) => l.roomId));
    optimisticJoinedRoomIds.forEach((id) => ids.add(id));
    if (currentUser && selectedRoomId && roomMembers.some((m) => m.uid === currentUser.uid)) {
      ids.add(selectedRoomId);
    }
    return ids;
  }, [joinedRoomLinks, optimisticJoinedRoomIds, currentUser, selectedRoomId, roomMembers]);

  const isJoinedSelectedRoom = Boolean(
    currentUser &&
      selectedRoomId &&
      (roomMembers.some((m) => m.uid === currentUser.uid) ||
        joinedRoomLinks.some((l) => l.roomId === selectedRoomId) ||
        optimisticJoinedRoomIds.has(selectedRoomId))
  );

  useEffect(() => {
    setSelectedRoomId((prev) => {
      if (prev && openRooms.some((r) => r.roomId === prev)) return prev;
      return openRooms[0]?.roomId || '';
    });
  }, [openRooms]);

  const reportFirestoreError = (
    err: unknown,
    operationType: OperationType,
    path: string | null,
    userMessage: string
  ) => {
    try {
      handleFirestoreError(err, operationType, path);
    } catch {
      /* structured error already logged by handleFirestoreError */
    }
    const rawDetail = err instanceof Error ? err.message : String(err);
    setActionError(`${userMessage} (${rawDetail})`);
  };

  const showTempSuccess = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => {
      setActionSuccess((curr) => (curr === msg ? null : curr));
    }, 3500);
  };

  // If user clicked "공유" from a 5km spot card, switch to Open Chat & prefill message
  useEffect(() => {
    if (prefilledShareSpot) {
      setChatMode('open');
      setAttachSpotToOpen(true);
      setOpenMessageText(
        `[${prefilledShareSpot}] 포인트 안전하고 초보자도 낚시하기 좋아요! 정보 공유합니다.`
      );
      onClearPrefilledShareSpot();
    }
  }, [prefilledShareSpot, onClearPrefilledShareSpot]);

  // Seed default public open chat rooms on first authenticated boot if missing
  useEffect(() => {
    if (!currentUser || seededRef.current) return;
    seededRef.current = true;

    const ensureDefaultRooms = async () => {
      try {
        const photoURL = truncateToLength(currentUser.photoURL || '', MAX_PHOTO_URL_LEN);
        let dismissedIds: string[] = [];
        try {
          dismissedIds = JSON.parse(
            localStorage.getItem('iltamanseon_dismissed_default_rooms') || '[]'
          );
        } catch {
          dismissedIds = [];
        }

        for (const seed of DEFAULT_OPEN_ROOMS) {
          if (Array.isArray(dismissedIds) && dismissedIds.includes(seed.roomId)) {
            continue;
          }
          const roomRef = doc(db, 'open_rooms', seed.roomId);
          const snap = await getDoc(roomRef);
          if (!snap.exists()) {
            const batch = writeBatch(db);
            batch.set(roomRef, {
              roomId: seed.roomId,
              title: seed.title,
              region: seed.region,
              description: seed.description,
              isPublic: true,
              inviteCode: '',
              createdBy: currentUser.uid,
              creatorName: effectiveNickname,
              lastMessageText: ROOM_UPDATED_STATUS_TEXT,
              lastMessageAt: serverTimestamp(),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            batch.set(doc(db, 'open_rooms', seed.roomId, 'members', currentUser.uid), {
              roomId: seed.roomId,
              uid: currentUser.uid,
              displayName: effectiveNickname,
              photoURL,
              inviteCode: '',
              joinedAt: serverTimestamp(),
            });
            batch.set(doc(db, 'user_room_links', currentUser.uid, 'rooms', seed.roomId), {
              roomId: seed.roomId,
              uid: currentUser.uid,
              title: seed.title,
              region: seed.region,
              isPublic: true,
              inviteCode: '',
              joinedAt: serverTimestamp(),
            });
            await batch.commit();
          }
        }
      } catch (err) {
        console.error('Default open rooms init check error:', err);
      }
    };

    void ensureDefaultRooms();
  }, [currentUser, effectiveNickname]);

  // Subscribe to public rooms, creator's own rooms (including private), and joined private room links
  useEffect(() => {
    if (!currentUser) {
      setPublicRoomsList([]);
      setCreatedRoomsList([]);
      setJoinedRoomLinks([]);
      setLinkedPrivateRoomsMap({});
      return;
    }

    const qPublic = query(collection(db, 'open_rooms'), where('isPublic', '==', true));
    const unsubPublic = onSnapshot(
      qPublic,
      (snapshot) => {
        setPublicRoomsList(snapshot.docs.map((d) => d.data() as OpenRoom));
      },
      (err) =>
        reportFirestoreError(
          err,
          OperationType.LIST,
          'open_rooms',
          '공개 채팅방 목록을 불러오는 중 오류가 발생했습니다.'
        )
    );

    const qCreated = query(collection(db, 'open_rooms'), where('createdBy', '==', currentUser.uid));
    const unsubCreated = onSnapshot(
      qCreated,
      (snapshot) => {
        setCreatedRoomsList(snapshot.docs.map((d) => d.data() as OpenRoom));
      },
      (err) =>
        reportFirestoreError(
          err,
          OperationType.LIST,
          'open_rooms',
          '내가 만든 채팅방 목록을 불러오는 중 오류가 발생했습니다.'
        )
    );

    const qLinks = query(
      collection(db, 'user_room_links', currentUser.uid, 'rooms'),
      where('uid', '==', currentUser.uid)
    );
    const unsubLinks = onSnapshot(
      qLinks,
      (snapshot) => {
        setJoinedRoomLinks(snapshot.docs.map((d) => d.data() as UserRoomLink));
      },
      (err) =>
        reportFirestoreError(
          err,
          OperationType.LIST,
          `user_room_links/${currentUser.uid}/rooms`,
          '참여 중인 비공개 방 목록을 불러오지 못했습니다.'
        )
    );

    return () => {
      unsubPublic();
      unsubCreated();
      unsubLinks();
    };
  }, [currentUser]);

  // Listen to each joined private room document via allowed `get`
  useEffect(() => {
    const privateLinks = joinedRoomLinks.filter(
      (link) => link.isPublic === false || Boolean(link.inviteCode)
    );
    if (!currentUser || privateLinks.length === 0) {
      setLinkedPrivateRoomsMap({});
      return;
    }

    const unsubs: Array<() => void> = [];
    for (const link of privateLinks) {
      const roomRef = doc(db, 'open_rooms', link.roomId);
      const unsub = onSnapshot(
        roomRef,
        (snap) => {
          if (snap.exists()) {
            const roomData = snap.data() as OpenRoom;
            setLinkedPrivateRoomsMap((prev) => ({ ...prev, [link.roomId]: roomData }));
          } else {
            // Room was deleted by its creator; remove local map entry and clean up link
            setLinkedPrivateRoomsMap((prev) => {
              if (!(link.roomId in prev)) return prev;
              const next = { ...prev };
              delete next[link.roomId];
              return next;
            });
            deleteDoc(doc(db, 'user_room_links', currentUser.uid, 'rooms', link.roomId)).catch(() => {
              /* ignore */
            });
          }
        },
        () => {
          // Membership removed or room deleted
          setLinkedPrivateRoomsMap((prev) => {
            if (!(link.roomId in prev)) return prev;
            const next = { ...prev };
            delete next[link.roomId];
            return next;
          });
        }
      );
      unsubs.push(unsub);
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [currentUser, joinedRoomLinks]);

  // Subscribe to members of selected room
  useEffect(() => {
    if (!currentUser || !selectedRoomId) {
      setRoomMembers([]);
      return;
    }

    const membersQuery = query(
      collection(db, 'open_rooms', selectedRoomId, 'members'),
      where('roomId', '==', selectedRoomId)
    );
    const unsubMembers = onSnapshot(
      membersQuery,
      (snapshot) => {
        setRoomMembers(snapshot.docs.map((d) => d.data() as OpenRoomMember));
      },
      (err) => {
        if (deletingRoomIdRef.current === selectedRoomId) return;
        reportFirestoreError(
          err,
          OperationType.LIST,
          `open_rooms/${selectedRoomId}/members`,
          '참여자 목록을 불러오지 못했습니다.'
        );
      }
    );

    return () => {
      unsubMembers();
    };
  }, [currentUser, selectedRoomId]);

  // Subscribe to messages ONLY when current user has joined the selected room
  useEffect(() => {
    if (!currentUser || !selectedRoomId || !canReadRoomMessages(isJoinedSelectedRoom, currentUser.uid)) {
      setRoomMessages([]);
      return;
    }

    const msgsQuery = query(
      collection(db, 'open_rooms', selectedRoomId, 'messages'),
      where('roomId', '==', selectedRoomId)
    );
    const unsubMsgs = onSnapshot(
      msgsQuery,
      (snapshot) => {
        const list: OpenRoomMessage[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<OpenRoomMessage, 'id'>),
        }));
        list.sort((a, b) => getMessageSortTimeMs(a) - getMessageSortTimeMs(b));
        setRoomMessages(list);
      },
      (err) => {
        if (deletingRoomIdRef.current === selectedRoomId) return;
        reportFirestoreError(
          err,
          OperationType.LIST,
          `open_rooms/${selectedRoomId}/messages`,
          '방에 참여한 사용자만 메시지를 열람할 수 있습니다.'
        );
      }
    );

    return () => {
      unsubMsgs();
    };
  }, [currentUser, selectedRoomId, isJoinedSelectedRoom]);

  useEffect(() => {
    openMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [roomMessages.length]);

  // Subscribe to public angler profiles directory & user's 1:1 DM threads
  useEffect(() => {
    if (!currentUser) {
      setProfiles([]);
      setDmThreads([]);
      return;
    }

    const profilesQuery = query(
      collection(db, 'public_profiles'),
      where('isDiscoverable', '==', true)
    );
    const unsubProfiles = onSnapshot(
      profilesQuery,
      (snapshot) => {
        const list: PublicProfile[] = snapshot.docs
          .map((d) => d.data() as PublicProfile)
          .filter((p) => p.uid !== currentUser.uid);
        setProfiles(list);
      },
      (err) =>
        reportFirestoreError(
          err,
          OperationType.LIST,
          'public_profiles',
          '낚시인 목록을 불러오지 못했습니다.'
        )
    );

    const threadsQuery = query(
      collection(db, 'dm_threads'),
      where('participantUids', 'array-contains', currentUser.uid)
    );
    const unsubThreads = onSnapshot(
      threadsQuery,
      (snapshot) => {
        const list: DmThread[] = snapshot.docs.map((d) => d.data() as DmThread);
        list.sort((a, b) => {
          const tA = a.lastMessageAt?.toMillis?.() ?? 0;
          const tB = b.lastMessageAt?.toMillis?.() ?? 0;
          return tB - tA;
        });
        setDmThreads(list);
      },
      (err) =>
        reportFirestoreError(
          err,
          OperationType.LIST,
          'dm_threads',
          '1:1 대화 목록을 불러오지 못했습니다.'
        )
    );

    return () => {
      unsubProfiles();
      unsubThreads();
    };
  }, [currentUser]);

  // Subscribe to messages in active 1:1 DM thread
  const activeDmThreadId =
    currentUser && selectedDmPartner
      ? buildDmThreadId(currentUser.uid, selectedDmPartner.uid)
      : null;

  useEffect(() => {
    if (!currentUser || !activeDmThreadId) {
      setDmMessages([]);
      return;
    }

    const dmQuery = query(
      collection(db, 'dm_threads', activeDmThreadId, 'messages'),
      where('participantUids', 'array-contains', currentUser.uid)
    );
    const unsub = onSnapshot(
      dmQuery,
      (snapshot) => {
        const list: DmMessage[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<DmMessage, 'id'>),
        }));
        list.sort((a, b) => getMessageSortTimeMs(a) - getMessageSortTimeMs(b));
        setDmMessages(list);
      },
      (err) =>
        reportFirestoreError(
          err,
          OperationType.LIST,
          `dm_threads/${activeDmThreadId}/messages`,
          '1:1 메시지를 불러오지 못했습니다.'
        )
    );

    return () => unsub();
  }, [currentUser, activeDmThreadId]);

  useEffect(() => {
    dmMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [dmMessages.length]);

  const handleUpdateFavoriteRegion = async (nextReg: '전체' | SeaRegion) => {
    setFavoriteRegion(nextReg);
    if (!currentUser) return;
    try {
      await setDoc(
        doc(db, 'public_profiles', currentUser.uid),
        {
          uid: currentUser.uid,
          displayName: effectiveNickname,
          photoURL: truncateToLength(currentUser.photoURL || '', MAX_PHOTO_URL_LEN),
          favoriteRegion: nextReg,
          isDiscoverable: true,
          nicknameSet,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      reportFirestoreError(
        err,
        OperationType.UPDATE,
        `public_profiles/${currentUser.uid}`,
        '선호 해역을 저장하지 못했습니다.'
      );
    }
  };

  const handleJoinOpenRoom = async (room: OpenRoom) => {
    if (!currentUser) return;
    setIsJoiningRoomId(room.roomId);
    setActionError(null);
    const photoURL = truncateToLength(currentUser.photoURL || '', MAX_PHOTO_URL_LEN);
    const memberRef = doc(db, 'open_rooms', room.roomId, 'members', currentUser.uid);
    const linkRef = doc(db, 'user_room_links', currentUser.uid, 'rooms', room.roomId);
    const isPublic = room.isPublic !== false;
    const roomInviteCode = isPublic ? '' : room.inviteCode || '';

    try {
      const [memberSnap, linkSnap] = await Promise.all([getDoc(memberRef), getDoc(linkRef)]);
      const batch = writeBatch(db);

      if (!memberSnap.exists()) {
        batch.set(memberRef, {
          roomId: room.roomId,
          uid: currentUser.uid,
          displayName: effectiveNickname,
          photoURL,
          inviteCode: roomInviteCode,
          joinedAt: serverTimestamp(),
        });
      } else {
        batch.update(memberRef, {
          displayName: effectiveNickname,
          photoURL,
        });
      }

      if (!linkSnap.exists()) {
        batch.set(linkRef, {
          roomId: room.roomId,
          uid: currentUser.uid,
          title: truncateToLength(room.title, 60),
          region: room.region,
          isPublic,
          inviteCode: roomInviteCode,
          joinedAt: serverTimestamp(),
        });
      } else {
        batch.update(linkRef, {
          title: truncateToLength(room.title, 60),
          region: room.region,
          isPublic,
          inviteCode: roomInviteCode,
        });
      }

      await batch.commit();
      setOptimisticJoinedRoomIds((prev) => new Set(prev).add(room.roomId));
      setSelectedRoomId(room.roomId);
      showTempSuccess(`[${maskProfanityText(room.title)}] 방에 입장했습니다. 이제 대화 내용을 볼 수 있습니다.`);
    } catch (err) {
      reportFirestoreError(
        err,
        OperationType.CREATE,
        `open_rooms/${room.roomId}/members/${currentUser.uid}`,
        '채팅방 참여에 실패했습니다.'
      );
    } finally {
      setIsJoiningRoomId(null);
    }
  };

  const handleLeaveOpenRoom = async (room: OpenRoom) => {
    if (!currentUser) return;
    setActionError(null);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'open_rooms', room.roomId, 'members', currentUser.uid));
      batch.delete(doc(db, 'user_room_links', currentUser.uid, 'rooms', room.roomId));
      await batch.commit();
      setOptimisticJoinedRoomIds((prev) => {
        const next = new Set(prev);
        next.delete(room.roomId);
        return next;
      });
      setRoomMessages([]);
      showTempSuccess('방에서 나갔습니다.');
    } catch (err) {
      reportFirestoreError(
        err,
        OperationType.DELETE,
        `open_rooms/${room.roomId}/members/${currentUser.uid}`,
        '채팅방 나가기에 실패했습니다.'
      );
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const rawDesc =
      newRoomDesc.trim() ||
      (newRoomIsPublic
        ? '누구나 자유롭게 바다낚시·안전·조황 정보를 나누는 공개 오픈채팅방입니다.'
        : '초대 코드로 함께 소통하는 비공개 바다낚시 모임방입니다.');
    const validation = validateNewOpenRoomInput(newRoomTitle, rawDesc);
    if (!validation.valid) {
      setActionError(validation.error || '입력값을 확인해주세요.');
      return;
    }

    const cleanTitle = maskProfanityText(validation.cleanTitle);
    const cleanDesc = maskProfanityText(validation.cleanDescription);

    let cleanInviteCode = '';
    if (!newRoomIsPublic) {
      const codeCheck = validatePrivateInviteCode(newRoomInviteCode);
      if (!codeCheck.valid) {
        setActionError(codeCheck.error || '비공개 방 초대 코드를 확인해주세요.');
        return;
      }
      cleanInviteCode = codeCheck.code;
    }

    setActionError(null);
    const roomId = `${newRoomIsPublic ? 'open' : 'priv'}_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const photoURL = truncateToLength(currentUser.photoURL || '', MAX_PHOTO_URL_LEN);

    try {
      if (!newRoomIsPublic) {
        const existingCodeSnap = await getDoc(doc(db, 'room_invites', cleanInviteCode));
        if (existingCodeSnap.exists()) {
          setActionError('이미 사용 중인 초대 코드입니다. 다른 코드를 입력하거나 새로 생성해 주세요.');
          return;
        }
      }

      const batch = writeBatch(db);
      batch.set(doc(db, 'open_rooms', roomId), {
        roomId,
        title: cleanTitle,
        region: newRoomRegion,
        description: cleanDesc,
        isPublic: newRoomIsPublic,
        inviteCode: cleanInviteCode,
        createdBy: currentUser.uid,
        creatorName: effectiveNickname,
        lastMessageText: ROOM_UPDATED_STATUS_TEXT,
        lastMessageAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'open_rooms', roomId, 'members', currentUser.uid), {
        roomId,
        uid: currentUser.uid,
        displayName: effectiveNickname,
        photoURL,
        inviteCode: cleanInviteCode,
        joinedAt: serverTimestamp(),
      });
      batch.set(doc(db, 'user_room_links', currentUser.uid, 'rooms', roomId), {
        roomId,
        uid: currentUser.uid,
        title: cleanTitle,
        region: newRoomRegion,
        isPublic: newRoomIsPublic,
        inviteCode: cleanInviteCode,
        joinedAt: serverTimestamp(),
      });
      if (!newRoomIsPublic) {
        batch.set(doc(db, 'room_invites', cleanInviteCode), {
          inviteCode: cleanInviteCode,
          roomId,
          title: cleanTitle,
          region: newRoomRegion,
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
        });
      }
      await batch.commit();

      setOptimisticJoinedRoomIds((prev) => new Set(prev).add(roomId));
      setSelectedRoomId(roomId);
      setRoomVisibilityFilter('all');
      setIsCreatingRoom(false);
      setNewRoomTitle('');
      setNewRoomDesc('');
      setNewRoomIsPublic(true);
      setNewRoomInviteCode(generateInviteCode());
      showTempSuccess(
        newRoomIsPublic
          ? '새 공개 오픈채팅방이 개설되었습니다.'
          : `비공개 방이 개설되었습니다. (초대 코드: ${cleanInviteCode})`
      );
    } catch (err) {
      reportFirestoreError(
        err,
        OperationType.CREATE,
        `open_rooms/${roomId}`,
        '새 채팅방 개설에 실패했습니다.'
      );
    }
  };

  const handleJoinPrivateRoomByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const codeCheck = validatePrivateInviteCode(privateCodeInput);
    if (!codeCheck.valid) {
      setActionError(codeCheck.error || '초대 코드를 확인해 주세요.');
      return;
    }

    setIsJoiningByCode(true);
    setActionError(null);

    try {
      const inviteSnap = await getDoc(doc(db, 'room_invites', codeCheck.code));
      if (!inviteSnap.exists()) {
        setActionError('존재하지 않는 비공개 방 초대 코드입니다. 코드를 다시 확인해 주세요.');
        return;
      }

      const invite = inviteSnap.data() as {
        inviteCode: string;
        roomId: string;
        title: string;
        region: '전체' | SeaRegion;
      };
      const photoURL = truncateToLength(currentUser.photoURL || '', MAX_PHOTO_URL_LEN);
      const memberRef = doc(db, 'open_rooms', invite.roomId, 'members', currentUser.uid);
      const linkRef = doc(db, 'user_room_links', currentUser.uid, 'rooms', invite.roomId);
      const [memberSnap, linkSnap] = await Promise.all([getDoc(memberRef), getDoc(linkRef)]);

      const batch = writeBatch(db);
      if (!memberSnap.exists()) {
        batch.set(memberRef, {
          roomId: invite.roomId,
          uid: currentUser.uid,
          displayName: effectiveNickname,
          photoURL,
          inviteCode: invite.inviteCode,
          joinedAt: serverTimestamp(),
        });
      } else {
        batch.update(memberRef, {
          displayName: effectiveNickname,
          photoURL,
        });
      }

      if (!linkSnap.exists()) {
        batch.set(linkRef, {
          roomId: invite.roomId,
          uid: currentUser.uid,
          title: truncateToLength(invite.title, 60),
          region: invite.region,
          isPublic: false,
          inviteCode: invite.inviteCode,
          joinedAt: serverTimestamp(),
        });
      } else {
        batch.update(linkRef, {
          title: truncateToLength(invite.title, 60),
          region: invite.region,
          isPublic: false,
          inviteCode: invite.inviteCode,
        });
      }
      await batch.commit();

      setOptimisticJoinedRoomIds((prev) => new Set(prev).add(invite.roomId));
      setSelectedRoomId(invite.roomId);
      setPrivateCodeInput('');
      setRoomVisibilityFilter('all');
      showTempSuccess(`비공개 방 [${invite.title}]에 입장했습니다.`);
    } catch (err) {
      reportFirestoreError(
        err,
        OperationType.CREATE,
        `room_invites/${codeCheck.code}`,
        '비공개 방 입장에 실패했습니다.'
      );
    } finally {
      setIsJoiningByCode(false);
    }
  };

  const handleDeleteRoom = async (room: OpenRoom) => {
    if (!currentUser || !canDeleteRoom(room.createdBy, currentUser.uid)) {
      setActionError('방장만 채팅방을 삭제할 수 있습니다.');
      return;
    }
    setIsDeletingRoom(true);
    setActionError(null);
    deletingRoomIdRef.current = room.roomId;

    // Detach active room selection before removing member/message docs so onSnapshot doesn't emit false permission warnings
    if (selectedRoomId === room.roomId) {
      const nextRoom = openRooms.find((r) => r.roomId !== room.roomId);
      setSelectedRoomId(nextRoom?.roomId || '');
      setRoomMessages([]);
    }

    try {
      // 1) Delete room messages first while open_rooms/{roomId} still exists for rule checks
      try {
        const msgsSnap = await getDocs(
          query(collection(db, 'open_rooms', room.roomId, 'messages'), where('roomId', '==', room.roomId))
        );
        for (let i = 0; i < msgsSnap.docs.length; i += 400) {
          const chunk = msgsSnap.docs.slice(i, i + 400);
          const msgBatch = writeBatch(db);
          chunk.forEach((d) => msgBatch.delete(d.ref));
          await msgBatch.commit();
        }
      } catch (msgCleanupErr) {
        console.warn('Message cleanup warning during room delete:', msgCleanupErr);
      }

      // 2) Delete room members while open_rooms/{roomId} still exists
      try {
        const membersSnap = await getDocs(
          query(collection(db, 'open_rooms', room.roomId, 'members'), where('roomId', '==', room.roomId))
        );
        for (let i = 0; i < membersSnap.docs.length; i += 400) {
          const chunk = membersSnap.docs.slice(i, i + 400);
          const memBatch = writeBatch(db);
          chunk.forEach((d) => memBatch.delete(d.ref));
          await memBatch.commit();
        }
      } catch (memCleanupErr) {
        console.warn('Member cleanup warning during room delete:', memCleanupErr);
      }

      // 3) Delete room_invites (only if document exists), user_room_links, and the parent room doc
      const finalBatch = writeBatch(db);
      if (!room.isPublic && room.inviteCode) {
        const inviteRef = doc(db, 'room_invites', room.inviteCode);
        const inviteSnap = await getDoc(inviteRef).catch(() => null);
        if (inviteSnap && inviteSnap.exists()) {
          finalBatch.delete(inviteRef);
        }
      }
      finalBatch.delete(doc(db, 'user_room_links', currentUser.uid, 'rooms', room.roomId));
      finalBatch.delete(doc(db, 'open_rooms', room.roomId));
      await finalBatch.commit();

      if (DEFAULT_OPEN_ROOMS.some((d) => d.roomId === room.roomId)) {
        try {
          const prevDismissed = JSON.parse(
            localStorage.getItem('iltamanseon_dismissed_default_rooms') || '[]'
          );
          const nextDismissed = Array.isArray(prevDismissed)
            ? Array.from(new Set([...prevDismissed, room.roomId]))
            : [room.roomId];
          localStorage.setItem('iltamanseon_dismissed_default_rooms', JSON.stringify(nextDismissed));
        } catch {
          /* ignore */
        }
      }

      setConfirmDeleteRoomId(null);
      showTempSuccess(`[${maskProfanityText(room.title)}] 채팅방이 완전히 삭제되었습니다.`);
    } catch (err) {
      reportFirestoreError(
        err,
        OperationType.DELETE,
        `open_rooms/${room.roomId}`,
        '채팅방 삭제에 실패했습니다. 방장 권한을 확인해 주세요.'
      );
    } finally {
      deletingRoomIdRef.current = null;
      setIsDeletingRoom(false);
    }
  };

  const handleCopyInviteCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      showTempSuccess(`초대 코드: ${code}`);
    }
  };

  const handleSendOpenMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedRoomId) return;
    const targetRoom = openRooms.find((r) => r.roomId === selectedRoomId);
    if (!targetRoom) return;

    const { text: cleanText, hadProfanity } = sanitizeAndMaskMessageText(openMessageText);
    if (!cleanText) return;

    setIsSendingOpen(true);
    setActionError(null);

    const senderPhoto = truncateToLength(currentUser.photoURL || '', MAX_PHOTO_URL_LEN);
    const sharedSpotName = attachSpotToOpen ? truncateToLength(activeSpotLabel, MAX_SPOT_NAME_LEN) : '';
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const isRoomPublic = targetRoom.isPublic !== false;

    try {
      // Ensure member document exists before sending message (prevents permission failure from partial state)
      const memberRef = doc(db, 'open_rooms', selectedRoomId, 'members', currentUser.uid);
      const memberSnap = await getDoc(memberRef).catch(() => null);
      if (!memberSnap || !memberSnap.exists()) {
        if (isRoomPublic || targetRoom.createdBy === currentUser.uid) {
          await setDoc(memberRef, {
            roomId: selectedRoomId,
            uid: currentUser.uid,
            displayName: effectiveNickname,
            photoURL: senderPhoto,
            inviteCode: isRoomPublic ? '' : targetRoom.inviteCode || '',
            joinedAt: serverTimestamp(),
          });
          setOptimisticJoinedRoomIds((prev) => new Set(prev).add(selectedRoomId));
        } else {
          setActionError('채팅방 참여 정보가 확인되지 않습니다. 먼저 [방 참여하기]를 눌러주세요.');
          return;
        }
      }

      await setDoc(doc(db, 'open_rooms', selectedRoomId, 'messages', msgId), {
        roomId: selectedRoomId,
        isPublic: isRoomPublic,
        senderId: currentUser.uid,
        senderName: effectiveNickname,
        senderPhoto,
        text: cleanText,
        sharedSpotName,
        createdAt: serverTimestamp(),
      });

      setOpenMessageText('');
      setAttachSpotToOpen(false);
      if (hadProfanity) {
        showTempSuccess('비속어 일부가 * 표시로 자동 모자이크 처리되어 전송되었습니다.');
      }

      updateDoc(doc(db, 'open_rooms', selectedRoomId), {
        lastMessageText: ROOM_UPDATED_STATUS_TEXT,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch((previewErr) => {
        console.warn('Room preview update warning:', previewErr);
      });
    } catch (err) {
      reportFirestoreError(
        err,
        OperationType.WRITE,
        `open_rooms/${selectedRoomId}/messages/${msgId}`,
        '메시지를 전송하지 못했습니다. Google 계정 상태 및 채팅방 참여 여부를 확인해주세요.'
      );
    } finally {
      setIsSendingOpen(false);
    }
  };

  const handleDeleteOpenMessage = async (msg: OpenRoomMessage, room: OpenRoom) => {
    if (!currentUser || !canDeleteRoomMessage(msg.senderId, room.createdBy, currentUser.uid)) {
      setActionError('본인이 보낸 메시지이거나 방장만 삭제할 수 있습니다.');
      return;
    }
    setIsDeletingRoomMsg(true);
    setActionError(null);

    try {
      await deleteDoc(doc(db, 'open_rooms', room.roomId, 'messages', msg.id));
      setConfirmDeleteRoomMsgId(null);
      showTempSuccess('메시지가 삭제되었습니다.');
    } catch (err) {
      reportFirestoreError(
        err,
        OperationType.DELETE,
        `open_rooms/${room.roomId}/messages/${msg.id}`,
        '메시지 삭제에 실패했습니다.'
      );
    } finally {
      setIsDeletingRoomMsg(false);
    }
  };

  const handleStartDmWithUser = (partner: PublicProfile) => {
    setSelectedDmPartner(partner);
    setChatMode('dm');
  };

  const handleSendDmMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedDmPartner) return;
    const { text: cleanText, hadProfanity } = sanitizeAndMaskMessageText(dmMessageText);
    if (!cleanText) return;

    setIsSendingDm(true);
    setActionError(null);

    const threadId = buildDmThreadId(currentUser.uid, selectedDmPartner.uid);
    const myProfile = {
      uid: currentUser.uid,
      displayName: effectiveNickname,
      photoURL: truncateToLength(currentUser.photoURL || '', MAX_PHOTO_URL_LEN),
    };
    const partnerProfile = {
      uid: selectedDmPartner.uid,
      displayName: truncateToLength(selectedDmPartner.displayName || '낚시인', MAX_DISPLAY_NAME_LEN),
      photoURL: truncateToLength(selectedDmPartner.photoURL || '', MAX_PHOTO_URL_LEN),
    };
    const [u1, u2] = sortParticipantPair(myProfile, partnerProfile);
    const msgId = `dm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sharedSpotName = attachSpotToDm ? truncateToLength(activeSpotLabel, MAX_SPOT_NAME_LEN) : '';
    const existingThread = dmThreads.some((t) => t.threadId === threadId);

    try {
      const threadRef = doc(db, 'dm_threads', threadId);
      const messageRef = doc(db, 'dm_threads', threadId, 'messages', msgId);

      if (existingThread) {
        await setDoc(messageRef, {
          threadId,
          senderId: currentUser.uid,
          senderName: myProfile.displayName,
          recipientId: selectedDmPartner.uid,
          participantUids: [u1.uid, u2.uid],
          text: cleanText,
          sharedSpotName,
          createdAt: serverTimestamp(),
        });

        updateDoc(threadRef, {
          lastMessageText: truncateToLength(cleanText, MAX_PREVIEW_LEN),
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch((previewErr) => {
          console.warn('DM thread preview update warning:', previewErr);
        });
      } else {
        const batch = writeBatch(db);
        batch.set(threadRef, {
          threadId,
          user1Uid: u1.uid,
          user1Name: u1.displayName,
          user1Photo: u1.photoURL,
          user2Uid: u2.uid,
          user2Name: u2.displayName,
          user2Photo: u2.photoURL,
          participantUids: [u1.uid, u2.uid],
          lastMessageText: truncateToLength(cleanText, MAX_PREVIEW_LEN),
          lastMessageAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.set(messageRef, {
          threadId,
          senderId: currentUser.uid,
          senderName: myProfile.displayName,
          recipientId: selectedDmPartner.uid,
          participantUids: [u1.uid, u2.uid],
          text: cleanText,
          sharedSpotName,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
      }

      setDmMessageText('');
      setAttachSpotToDm(false);
      if (hadProfanity) {
        showTempSuccess('비속어 일부가 * 표시로 자동 모자이크 처리되어 전송되었습니다.');
      }
    } catch (err) {
      reportFirestoreError(
        err,
        OperationType.WRITE,
        `dm_threads/${threadId}/messages/${msgId}`,
        '1:1 메시지를 전송하지 못했습니다. 로그인 상태를 확인해주세요.'
      );
    } finally {
      setIsSendingDm(false);
    }
  };

  const handleDeleteDmMessage = async (msg: DmMessage, threadId: string) => {
    if (!currentUser || !selectedDmPartner) return;
    if (!canDeleteDmMessage(msg.senderId, [currentUser.uid, selectedDmPartner.uid], currentUser.uid)) {
      setActionError('본인이 보낸 메시지만 삭제할 수 있습니다.');
      return;
    }
    setIsDeletingDmMsg(true);
    setActionError(null);

    try {
      await deleteDoc(doc(db, 'dm_threads', threadId, 'messages', msg.id));
      const remaining = dmMessages.filter((m) => m.id !== msg.id);
      const latestRemaining = remaining[remaining.length - 1];
      const nextPreview = latestRemaining
        ? truncateToLength(maskProfanityText(latestRemaining.text), MAX_PREVIEW_LEN)
        : '메시지가 삭제되었습니다.';

      updateDoc(doc(db, 'dm_threads', threadId), {
        lastMessageText: nextPreview,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch((err) => console.warn('DM preview update warning:', err));

      setConfirmDeleteDmMsgId(null);
      showTempSuccess('메시지가 삭제되었습니다.');
    } catch (err) {
      reportFirestoreError(
        err,
        OperationType.DELETE,
        `dm_threads/${threadId}/messages/${msg.id}`,
        '1:1 메시지 삭제에 실패했습니다.'
      );
    } finally {
      setIsDeletingDmMsg(false);
    }
  };

  const handleDeleteDmThread = async (threadId: string) => {
    if (!currentUser) return;
    setIsDeletingDm(true);
    setActionError(null);

    try {
      const msgsSnap = await getDocs(
        query(
          collection(db, 'dm_threads', threadId, 'messages'),
          where('participantUids', 'array-contains', currentUser.uid)
        )
      );
      await deleteDoc(doc(db, 'dm_threads', threadId));
      for (let i = 0; i < msgsSnap.docs.length; i += 400) {
        const chunk = msgsSnap.docs.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      setConfirmDeleteDmThreadId(null);
      setSelectedDmPartner(null);
      showTempSuccess('1:1 대화방이 삭제되었습니다.');
    } catch (err) {
      reportFirestoreError(
        err,
        OperationType.DELETE,
        `dm_threads/${threadId}`,
        '1:1 대화방 삭제에 실패했습니다.'
      );
    } finally {
      setIsDeletingDm(false);
    }
  };

  // Sign-In Gate when not logged in with Google
  if (!currentUser) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-2xl p-6 sm:p-8 shadow-xl max-w-3xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 border-b border-[#4B9FE8]/20 pb-5">
            <div className="w-14 h-14 rounded-2xl bg-[#0B2948] border border-[#36D6E8]/40 flex items-center justify-center shrink-0">
              <MessageSquare className="w-7 h-7 text-[#36D6E8]" />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-bold text-[#F4FAFF]">
                낚시인 정보 공유 메신저 (오픈 채팅 · 비공개 방 · 1:1 메시지)
              </h3>
              <p className="text-sm text-[#A7C2D8] mt-1">
                Google 계정으로 로그인하고 나만의 닉네임을 설정한 뒤, 공개 오픈채팅방, 초대 코드 기반 비공개 방, 1:1 메시지를 이용해 보세요.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[#061B33]/80 border border-[#4B9FE8]/25 rounded-xl p-4 space-y-2">
              <div className="text-sm font-bold text-[#36D6E8] flex items-center gap-2">
                <Users className="w-4 h-4" /> 오픈 채팅 &amp; 비공개 초대 방
              </div>
              <p className="text-xs text-[#A7C2D8] leading-relaxed">
                누구나 자유롭게 참여하는 공개 오픈채팅방은 물론, 초대 코드로만 입장할 수 있는 비공개 방을 만들고 관리·삭제할 수 있습니다.
              </p>
            </div>
            <div className="bg-[#061B33]/80 border border-[#4B9FE8]/25 rounded-xl p-4 space-y-2">
              <div className="text-sm font-bold text-[#36D6E8] flex items-center gap-2">
                <Lock className="w-4 h-4" /> 닉네임 보호 &amp; 1:1 개인 메시지
              </div>
              <p className="text-xs text-[#A7C2D8] leading-relaxed">
                실명 대신 내가 원하는 낚시 닉네임으로 활동하며 동행과 둘만 읽을 수 있는 1:1 비공개 대화를 나눌 수 있습니다.
              </p>
            </div>
          </div>

          {authError && (
            <div className="p-3 bg-red-950/80 border border-red-500/40 rounded-xl text-xs text-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#E63946] shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <p className="text-xs text-[#A7C2D8]">
              Google 로그인 후 채팅에서 사용할 닉네임을 바로 설정할 수 있으며 이메일은 비공개로 보호됩니다.
            </p>
            <button
              type="button"
              onClick={onGoogleLogin}
              disabled={authLoading}
              className="w-full sm:w-auto min-h-[48px] px-6 py-3 btn-cyan-gradient font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 text-sm shrink-0 transition-all disabled:opacity-60"
            >
              <LogIn className="w-4 h-4" />
              {authLoading ? '로그인 확인 중...' : 'Google 계정으로 로그인'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const selectedRoom = openRooms.find((r) => r.roomId === selectedRoomId) || null;
  const isRoomCreator = Boolean(selectedRoom && canDeleteRoom(selectedRoom.createdBy, currentUser.uid));
  const activeDmThread = activeDmThreadId
    ? dmThreads.find((t) => t.threadId === activeDmThreadId) || null
    : null;

  const filteredProfiles = profiles.filter((p) => {
    const q = userSearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      p.displayName.toLowerCase().includes(q) ||
      (p.favoriteRegion || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* Nickname Setup Reminder if not customized yet */}
      {!nicknameSet && (
        <div className="bg-[#0B2948]/90 border border-[#36D6E8]/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs sm:text-sm text-[#F4FAFF]">
            <strong className="text-[#36D6E8]">닉네임을 설정해 주세요!</strong> 현재 기본 이름({effectiveNickname})으로 표시 중입니다.
          </div>
          <button
            type="button"
            onClick={onOpenNicknameModal}
            className="min-h-[38px] px-4 py-1.5 btn-cyan-gradient text-xs font-bold rounded-xl inline-flex items-center gap-1.5 shrink-0"
          >
            <Edit3 className="w-3.5 h-3.5" /> 닉네임 설정하기
          </button>
        </div>
      )}

      {/* Logged-in Profile & Messenger Mode Header */}
      <div className="bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {currentUser.photoURL ? (
            <img
              src={currentUser.photoURL}
              alt={effectiveNickname}
              referrerPolicy="no-referrer"
              className="w-11 h-11 rounded-full border border-[#36D6E8] object-cover"
            />
          ) : (
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#36D6E8] to-[#4B9FE8] text-[#041529] font-bold flex items-center justify-center">
              {effectiveNickname.slice(0, 1)}
            </div>
          )}
          <div>
            <div className="text-sm font-bold text-[#F4FAFF] flex flex-wrap items-center gap-2">
              <span>{effectiveNickname}</span>
              <button
                type="button"
                onClick={onOpenNicknameModal}
                className="px-2 py-0.5 rounded-md bg-[#061B33]/90 hover:bg-[#0B2948] text-[#36D6E8] border border-[#4B9FE8]/30 text-[11px] font-semibold inline-flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3" /> 닉네임 변경
              </button>
              <span className="text-[11px] font-medium text-emerald-300 inline-flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Google 인증됨
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-[#A7C2D8]">
              <label htmlFor="messenger-fav-region">주 출조 해역:</label>
              <select
                id="messenger-fav-region"
                value={favoriteRegion}
                onChange={(e) => handleUpdateFavoriteRegion(e.target.value as '전체' | SeaRegion)}
                className="bg-[#061B33] border border-[#4B9FE8]/25 rounded-lg px-2 py-1 text-xs text-[#F4FAFF]"
              >
                <option value="전체">전체</option>
                <option value="동해">동해</option>
                <option value="서해">서해</option>
                <option value="남해">남해</option>
                <option value="제주">제주</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-[#061B33] p-1 border border-[#4B9FE8]/25">
            <button
              type="button"
              onClick={() => setChatMode('open')}
              className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                chatMode === 'open' ? 'btn-cyan-gradient shadow' : 'text-[#A7C2D8] hover:text-[#F4FAFF]'
              }`}
            >
              <Users className="w-4 h-4" /> 채팅방 ({openRooms.length})
            </button>
            <button
              type="button"
              onClick={() => setChatMode('dm')}
              className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                chatMode === 'dm' ? 'btn-aqua-gradient shadow' : 'text-[#A7C2D8] hover:text-[#F4FAFF]'
              }`}
            >
              <Lock className="w-4 h-4" /> 1:1 개인 메시지 ({dmThreads.length})
            </button>
          </div>

          <button
            type="button"
            onClick={onGoogleLogout}
            className="min-h-[40px] px-3.5 py-1.5 bg-[#061B33] hover:bg-[#0B2948] text-[#A7C2D8] border border-[#4B9FE8]/25 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" /> 로그아웃
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3 bg-emerald-950/70 border border-emerald-500/40 rounded-xl text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-red-950/70 border border-red-500/40 rounded-xl text-xs text-red-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[#E63946] shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* ================= MODE 1: OPEN & PRIVATE CHAT ROOMS ================= */}
      {chatMode === 'open' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Room List Sidebar */}
          <div className="lg:col-span-4 bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-base font-bold text-[#F4FAFF] flex items-center gap-2">
                <Users className="w-4 h-4 text-[#36D6E8]" /> 채팅방 목록
              </h4>
              <button
                type="button"
                onClick={() => setIsCreatingRoom((v) => !v)}
                className="min-h-[38px] px-3 py-1.5 btn-cyan-gradient rounded-lg text-xs font-bold inline-flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> 방 만들기
              </button>
            </div>

            {/* Room Visibility Filter */}
            <div className="grid grid-cols-3 gap-1 bg-[#061B33] p-1 rounded-xl border border-[#4B9FE8]/25 text-[11px] font-semibold">
              {[
                { key: 'all', label: `전체 (${openRooms.length})` },
                { key: 'public', label: `공개 (${openRooms.filter((r) => r.isPublic).length})` },
                { key: 'private', label: `비공개 (${openRooms.filter((r) => !r.isPublic).length})` },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setRoomVisibilityFilter(tab.key as 'all' | 'public' | 'private')}
                  className={`py-1.5 rounded-lg transition-colors ${
                    roomVisibilityFilter === tab.key
                      ? 'btn-aqua-gradient'
                      : 'text-[#A7C2D8] hover:text-[#F4FAFF]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Create Room Form (Public or Private) */}
            {isCreatingRoom && (
              <form
                onSubmit={handleCreateRoom}
                className="bg-[#061B33]/85 border border-[#36D6E8]/35 rounded-xl p-3.5 space-y-3"
              >
                <div>
                  <span className="block text-[11px] font-bold text-[#36D6E8] mb-1.5">
                    1단계 · 방 공개 여부 선택 (필수)
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNewRoomIsPublic(true)}
                      aria-pressed={newRoomIsPublic}
                      className={`py-2.5 px-2.5 rounded-lg text-xs font-bold border inline-flex items-center justify-center gap-1 transition-colors ${
                        newRoomIsPublic
                          ? 'btn-cyan-gradient border-[#36D6E8] shadow'
                          : 'bg-[#0B2948] text-[#A7C2D8] border-[#4B9FE8]/25 hover:text-[#F4FAFF]'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" /> 공개 (누구나 참여)
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewRoomIsPublic(false)}
                      aria-pressed={!newRoomIsPublic}
                      className={`py-2.5 px-2.5 rounded-lg text-xs font-bold border inline-flex items-center justify-center gap-1 transition-colors ${
                        !newRoomIsPublic
                          ? 'btn-aqua-gradient border-[#4B9FE8] shadow'
                          : 'bg-[#0B2948] text-[#A7C2D8] border-[#4B9FE8]/25 hover:text-[#F4FAFF]'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" /> 비공개 (초대코드)
                    </button>
                  </div>
                  <p className="text-[10px] text-[#A7C2D8] mt-1">
                    {newRoomIsPublic
                      ? '전체 목록에 공개되어 모든 낚시인이 자유롭게 참여할 수 있습니다.'
                      : '전체 목록에 숨겨지며 초대 코드를 입력한 지인만 참여할 수 있습니다.'}
                  </p>
                </div>

                {!newRoomIsPublic && (
                  <div className="bg-[#0B2948]/85 border border-[#36D6E8]/30 rounded-lg p-2.5 space-y-1.5">
                    <label htmlFor="new-room-invite-code" className="block text-[11px] text-[#36D6E8] font-semibold">
                      초대 코드 (4~20자 영문·숫자)
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        id="new-room-invite-code"
                        type="text"
                        required={!newRoomIsPublic}
                        value={newRoomInviteCode}
                        onChange={(e) => setNewRoomInviteCode(e.target.value.toUpperCase())}
                        placeholder="예: SEA482"
                        className="flex-1 bg-[#061B33] border border-[#4B9FE8]/25 rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#F4FAFF]"
                      />
                      <button
                        type="button"
                        onClick={() => setNewRoomInviteCode(generateInviteCode())}
                        className="px-2.5 py-1.5 bg-[#103653] hover:bg-[#184c73] text-xs text-[#F4FAFF] rounded-lg border border-[#4B9FE8]/25 shrink-0"
                      >
                        새 코드
                      </button>
                    </div>
                    <p className="text-[10px] text-[#A7C2D8]">
                      이 초대 코드를 아는 사용자만 방에 들어올 수 있습니다.
                    </p>
                  </div>
                )}

                <div>
                  <label htmlFor="new-room-title" className="block text-[11px] text-[#A7C2D8] mb-1">
                    2단계 · 채팅방 이름 (2~60자)
                  </label>
                  <input
                    id="new-room-title"
                    type="text"
                    required
                    value={newRoomTitle}
                    onChange={(e) => setNewRoomTitle(e.target.value)}
                    placeholder={newRoomIsPublic ? '예: 부산 기장 방파제 초보방' : '예: 우리 동호회 출조 비밀방'}
                    className="w-full bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-lg px-3 py-2 text-xs text-[#F4FAFF]"
                  />
                </div>
                <div>
                  <label htmlFor="new-room-region" className="block text-[11px] text-[#A7C2D8] mb-1">
                    해역 구분
                  </label>
                  <select
                    id="new-room-region"
                    value={newRoomRegion}
                    onChange={(e) => setNewRoomRegion(e.target.value as '전체' | SeaRegion)}
                    className="w-full bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-lg px-3 py-2 text-xs text-[#F4FAFF]"
                  >
                    <option value="전체">전체</option>
                    <option value="동해">동해</option>
                    <option value="서해">서해</option>
                    <option value="남해">남해</option>
                    <option value="제주">제주</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="new-room-desc" className="block text-[11px] text-[#A7C2D8] mb-1">
                    한 줄 소개 (미입력 시 자동 기본 소개 적용)
                  </label>
                  <input
                    id="new-room-desc"
                    type="text"
                    value={newRoomDesc}
                    onChange={(e) => setNewRoomDesc(e.target.value)}
                    placeholder="예: 5km 근방 안전한 방파제 정보 공유해요"
                    className="w-full bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-lg px-3 py-2 text-xs text-[#F4FAFF]"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsCreatingRoom(false)}
                    className="px-3 py-1.5 text-xs bg-[#0B2948] text-[#A7C2D8] border border-[#4B9FE8]/25 rounded-lg"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 text-xs btn-cyan-gradient font-bold rounded-lg"
                  >
                    {newRoomIsPublic ? '공개방 개설' : '비공개방 개설'}
                  </button>
                </div>
              </form>
            )}

            {/* Join Private Room by Invite Code */}
            <form
              onSubmit={handleJoinPrivateRoomByCode}
              className="bg-[#061B33]/65 border border-[#4B9FE8]/25 rounded-xl p-3 space-y-2"
            >
              <label htmlFor="private-code-join" className="text-[11px] font-bold text-[#36D6E8] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" /> 비공개 방 초대 코드로 입장
              </label>
              <div className="flex gap-1.5">
                <input
                  id="private-code-join"
                  type="text"
                  value={privateCodeInput}
                  onChange={(e) => setPrivateCodeInput(e.target.value.toUpperCase())}
                  placeholder="초대 코드 입력 (예: SEA482)"
                  className="flex-1 bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#F4FAFF] placeholder-[#A7C2D8]/50"
                />
                <button
                  type="submit"
                  disabled={isJoiningByCode || !privateCodeInput.trim()}
                  className="px-3 py-1.5 btn-aqua-gradient rounded-lg text-xs font-bold shrink-0 disabled:opacity-50"
                >
                  {isJoiningByCode ? '확인...' : '입장'}
                </button>
              </div>
            </form>

            {/* Rooms List */}
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {visibleRooms.length > 0 ? (
                visibleRooms.map((room) => {
                  const isActive = room.roomId === selectedRoomId;
                  const isJoined = joinedRoomIds.has(room.roomId);
                  const isHost = canDeleteRoom(room.createdBy, currentUser.uid);
                  return (
                    <button
                      key={room.roomId}
                      type="button"
                      onClick={() => {
                        setSelectedRoomId(room.roomId);
                        setConfirmDeleteRoomId(null);
                        setConfirmDeleteRoomMsgId(null);
                      }}
                      className={`w-full text-left p-3.5 rounded-xl border transition-all space-y-1.5 ${
                        isActive
                          ? 'bg-[#0B2948]/95 border-[#36D6E8]/70 shadow-lg shadow-[#36D6E8]/10'
                          : 'bg-[#061B33]/65 border-[#4B9FE8]/20 hover:border-[#4B9FE8]/45'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-[#36D6E8] inline-flex items-center gap-1 flex-wrap">
                          {!room.isPublic ? (
                            <>
                              <Lock className="w-3 h-3 text-amber-300" />
                              <span className="text-amber-300">비공개</span> ·
                            </>
                          ) : (
                            <Globe className="w-3 h-3 text-[#36D6E8]" />
                          )}
                          {room.region}
                          {isHost && (
                            <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-500/40 text-amber-300 text-[10px]">
                              방장
                            </span>
                          )}
                          <span
                            className={`ml-1 px-1.5 py-0.5 rounded text-[10px] ${
                              isJoined
                                ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/30'
                                : 'bg-[#0B2948] text-[#A7C2D8] border border-[#4B9FE8]/25'
                            }`}
                          >
                            {isJoined ? '참여 중' : '미참여'}
                          </span>
                        </span>
                        <span className="text-[11px] text-[#A7C2D8] shrink-0">
                          {formatMessageTime(room.lastMessageAt)}
                        </span>
                      </div>
                      <h5 className="text-sm font-bold text-white truncate">
                        {maskProfanityText(room.title)}
                      </h5>
                      <p className="text-xs text-[#A7C2D8] truncate">
                        {isJoined ? maskProfanityText(room.lastMessageText) : ROOM_HIDDEN_PREVIEW_TEXT}
                      </p>
                    </button>
                  );
                })
              ) : (
                <p className="text-xs text-[#A7C2D8] text-center py-6">
                  조건에 맞는 채팅방이 없습니다.
                </p>
              )}
            </div>
          </div>

          {/* Active Chat Room */}
          <div className="lg:col-span-8 bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-2xl flex flex-col min-h-[540px] max-h-[700px]">
            {selectedRoom ? (
              <>
                <div className="p-4 border-b border-[#4B9FE8]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                      {!selectedRoom.isPublic ? (
                        <span className="text-amber-300 inline-flex items-center gap-1">
                          <Lock className="w-3.5 h-3.5" /> 비공개 방
                        </span>
                      ) : (
                        <span className="text-[#36D6E8] inline-flex items-center gap-1">
                          <Globe className="w-3.5 h-3.5" /> {selectedRoom.region} 오픈채팅
                        </span>
                      )}
                      <span className="text-[#A7C2D8]/50">·</span>
                      <span className="text-[#A7C2D8]">참여자 {roomMembers.length}명</span>
                      <span className="text-[#A7C2D8]/50">·</span>
                      <span className="text-[#A7C2D8] inline-flex items-center gap-1">
                        <Shield className="w-3 h-3 text-amber-300" /> 방장: {selectedRoom.creatorName}
                        {isRoomCreator && (
                          <span className="text-amber-300 font-bold">(나)</span>
                        )}
                      </span>
                    </div>
                    <h4 className="text-lg font-bold text-[#F4FAFF]">
                      {maskProfanityText(selectedRoom.title)}
                    </h4>
                    <p className="text-xs text-[#A7C2D8]">
                      {maskProfanityText(selectedRoom.description)}
                    </p>
                    <p className="text-[11px] text-[#36D6E8]/90">
                      참여자만 대화 내용 열람 가능 · 비속어 * 자동 모자이크 · 방장만 방 삭제 가능
                    </p>

                    {!selectedRoom.isPublic && selectedRoom.inviteCode && isJoinedSelectedRoom && (
                      <div className="inline-flex items-center gap-2 pt-1">
                        <span className="text-xs bg-[#061B33] border border-amber-500/30 text-amber-200 px-2.5 py-1 rounded-lg font-mono">
                          초대 코드: {selectedRoom.inviteCode}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyInviteCode(selectedRoom.inviteCode!)}
                          className="px-2.5 py-1 bg-[#0B2948] hover:bg-[#16426d] text-[#F4FAFF] rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 border border-[#4B9FE8]/25"
                        >
                          {copiedCode ? <Check className="w-3 h-3 text-emerald-300" /> : <Copy className="w-3 h-3" />}
                          {copiedCode ? '복사됨' : '코드 복사'}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {isJoinedSelectedRoom ? (
                      <button
                        type="button"
                        onClick={() => handleLeaveOpenRoom(selectedRoom)}
                        className="min-h-[38px] px-3 py-1.5 bg-[#061B33] hover:bg-[#0B2948] text-[#A7C2D8] border border-[#4B9FE8]/25 rounded-xl text-xs font-semibold"
                      >
                        방 나가기
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isJoiningRoomId === selectedRoom.roomId}
                        onClick={() => handleJoinOpenRoom(selectedRoom)}
                        className="min-h-[38px] px-4 py-1.5 btn-cyan-gradient rounded-xl text-xs font-bold disabled:opacity-60"
                      >
                        {isJoiningRoomId === selectedRoom.roomId ? '참여 중...' : '방 참여하기'}
                      </button>
                    )}

                    {isRoomCreator && (
                      confirmDeleteRoomId === selectedRoom.roomId ? (
                        <div className="inline-flex items-center gap-1.5 bg-red-950/70 border border-red-500/40 rounded-xl px-2.5 py-1">
                          <button
                            type="button"
                            disabled={isDeletingRoom}
                            onClick={() => handleDeleteRoom(selectedRoom)}
                            className="text-xs font-bold text-red-300 hover:text-red-200 px-1.5 py-1"
                          >
                            {isDeletingRoom ? '삭제 중...' : '삭제 확인'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteRoomId(null)}
                            className="text-xs text-[#A7C2D8] hover:text-[#F4FAFF] px-1.5 py-1"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteRoomId(selectedRoom.roomId)}
                          className="min-h-[38px] px-3 py-1.5 bg-red-950/60 hover:bg-red-900/70 text-red-300 border border-red-500/30 rounded-xl text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> 방 삭제 (방장 전용)
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* Room Members Quick DM Strip (visible to joined members) */}
                {isJoinedSelectedRoom && roomMembers.length > 0 && (
                  <div className="px-4 py-2 bg-[#061B33]/60 border-b border-[#4B9FE8]/20 flex items-center gap-2 overflow-x-auto text-xs">
                    <span className="text-[#A7C2D8] shrink-0">참여자:</span>
                    {roomMembers.map((member) =>
                      member.uid === currentUser.uid ? (
                        <span
                          key={member.uid}
                          className="px-2.5 py-1 rounded-lg bg-[#36D6E8]/20 text-[#36D6E8] border border-[#36D6E8]/35 shrink-0"
                        >
                          {effectiveNickname} (나)
                        </span>
                      ) : (
                        <button
                          key={member.uid}
                          type="button"
                          onClick={() =>
                            handleStartDmWithUser({
                              uid: member.uid,
                              displayName: member.displayName,
                              photoURL: member.photoURL,
                              favoriteRegion: '전체',
                              isDiscoverable: true,
                            })
                          }
                          className="px-2.5 py-1 rounded-lg bg-[#0B2948] hover:bg-[#16426d] text-[#F4FAFF] border border-[#4B9FE8]/25 shrink-0 inline-flex items-center gap-1"
                          title={`${member.displayName}님에게 1:1 메시지 보내기`}
                        >
                          {member.displayName} <ArrowRight className="w-3 h-3" />
                        </button>
                      )
                    )}
                  </div>
                )}

                {/* Messages Feed (Strictly gated to joined room members) */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#061B33]/35">
                  {!isJoinedSelectedRoom ? (
                    <div
                      className="h-full flex flex-col items-center justify-center text-center px-6 py-12 space-y-4"
                      data-testid="room-join-gate"
                    >
                      <div className="w-14 h-14 rounded-2xl bg-[#0B2948] border border-[#36D6E8]/40 flex items-center justify-center">
                        <Lock className="w-7 h-7 text-[#36D6E8]" />
                      </div>
                      <div className="space-y-1.5 max-w-md">
                        <h5 className="text-base font-bold text-[#F4FAFF]">
                          방에 참여한 사람만 메시지 내용을 확인할 수 있습니다
                        </h5>
                        <p className="text-xs text-[#A7C2D8] leading-relaxed">
                          대화 내용 보호와 건전한 낚시 커뮤니티 운영을 위해 입장 전에는 이전 메시지가 비공개 처리됩니다. 아래 버튼을 눌러 참여하면 바로 대화에 함께할 수 있습니다.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isJoiningRoomId === selectedRoom.roomId}
                        onClick={() => handleJoinOpenRoom(selectedRoom)}
                        className="min-h-[44px] px-6 py-2.5 btn-cyan-gradient font-bold rounded-xl text-xs shadow-lg disabled:opacity-60"
                      >
                        {isJoiningRoomId === selectedRoom.roomId
                          ? '방 입장 처리 중...'
                          : '방 참여하고 메시지 보기'}
                      </button>
                    </div>
                  ) : roomMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-[#A7C2D8] text-xs space-y-2 py-12">
                      <Compass className="w-8 h-8 text-[#4B9FE8]/60" />
                      <p>아직 대화가 없습니다. 첫 번째 조황·포인트 정보를 남겨보세요!</p>
                    </div>
                  ) : (
                    roomMessages.map((msg) => {
                      const isMine = msg.senderId === currentUser.uid;
                      const canDelete = canDeleteRoomMessage(
                        msg.senderId,
                        selectedRoom.createdBy,
                        currentUser.uid
                      );
                      const displayText = maskProfanityText(msg.text);
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                        >
                          {!isMine ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleStartDmWithUser({
                                  uid: msg.senderId,
                                  displayName: msg.senderName,
                                  photoURL: msg.senderPhoto,
                                  favoriteRegion: '전체',
                                  isDiscoverable: true,
                                })
                              }
                              className="text-[11px] text-[#36D6E8] hover:underline mb-1 font-medium"
                            >
                              {msg.senderName} · 1:1 대화
                            </button>
                          ) : (
                            <span className="text-[10px] text-[#A7C2D8] mb-1">
                              {msg.senderName}
                            </span>
                          )}
                          <div
                            className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm space-y-1.5 ${
                              isMine
                                ? 'bg-gradient-to-br from-[#36D6E8]/90 to-[#4B9FE8]/90 text-[#041529] font-medium rounded-br-sm shadow'
                                : 'bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 text-[#F4FAFF] rounded-bl-sm'
                            }`}
                          >
                            {msg.sharedSpotName && (
                              <div className={`text-[11px] font-bold flex items-center gap-1 ${isMine ? 'text-[#041529]' : 'text-amber-200'}`}>
                                <MapPin className="w-3 h-3" /> 공유 포인트: {msg.sharedSpotName}
                              </div>
                            )}
                            <p className="whitespace-pre-wrap break-words leading-relaxed">{displayText}</p>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-[#A7C2D8]/70">
                              {formatMessageTime(msg.createdAt)}
                            </span>
                            {canDelete && (
                              confirmDeleteRoomMsgId === msg.id ? (
                                <span className="inline-flex items-center gap-1.5 bg-red-950/70 border border-red-500/40 rounded-lg px-2 py-0.5 text-[10px]">
                                  <button
                                    type="button"
                                    disabled={isDeletingRoomMsg}
                                    onClick={() => handleDeleteOpenMessage(msg, selectedRoom)}
                                    className="font-bold text-red-300 hover:text-red-200"
                                  >
                                    {isDeletingRoomMsg ? '삭제 중...' : '삭제 확인'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteRoomMsgId(null)}
                                    className="text-[#A7C2D8] hover:text-[#F4FAFF]"
                                  >
                                    취소
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteRoomMsgId(msg.id)}
                                  aria-label="메시지 삭제"
                                  className="text-[10px] text-red-300 hover:text-red-200 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-red-950/50"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  {isMine ? '삭제' : '방장 삭제'}
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={openMessagesEndRef} />
                </div>

                {/* Message Composer */}
                <div className="p-3.5 border-t border-[#4B9FE8]/20 bg-[#061B33]/65">
                  {isJoinedSelectedRoom ? (
                    <form onSubmit={handleSendOpenMessage} className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setAttachSpotToOpen((v) => !v)}
                          aria-pressed={attachSpotToOpen}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors inline-flex items-center gap-1 ${
                            attachSpotToOpen
                              ? 'bg-amber-950/80 text-amber-200 border-amber-500/40'
                              : 'bg-[#0B2948] text-[#A7C2D8] border-[#4B9FE8]/25'
                          }`}
                        >
                          <MapPin className="w-3 h-3" />
                          {attachSpotToOpen
                            ? `✓ 포인트 첨부: ${activeSpotLabel}`
                            : `+ 내 포인트 첨부 (${activeSpotLabel})`}
                        </button>
                        <span className="text-[11px] text-[#A7C2D8]">
                          비속어는 * 표시로 자동 모자이크됩니다
                        </span>
                      </div>

                      {/* Beginner 1-Tap Quick Prompts */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                        <span className="text-[10px] text-[#36D6E8] font-semibold shrink-0">초보 빠른 질문:</span>
                        {BEGINNER_CHAT_PROMPTS.map((promptText, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setOpenMessageText(promptText)}
                            className="px-2.5 py-1 rounded-lg bg-[#0B2948] hover:bg-[#16426d] text-[#F4FAFF] border border-[#4B9FE8]/25 text-[11px] whitespace-nowrap shrink-0 transition-colors"
                          >
                            + {promptText.slice(0, 16)}...
                          </button>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={openMessageText}
                          onChange={(e) => setOpenMessageText(e.target.value)}
                          placeholder="조황·채비·안전 정보를 입력하세요..."
                          className="flex-1 bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-xl px-4 py-2.5 text-sm text-[#F4FAFF] placeholder-[#A7C2D8]/50 focus:outline-none focus:border-[#36D6E8]"
                        />
                        <button
                          type="submit"
                          disabled={isSendingOpen || !openMessageText.trim()}
                          className="min-h-[44px] px-4 py-2 btn-cyan-gradient font-bold rounded-xl text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Send className="w-4 h-4" /> 전송
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-1">
                      <p className="text-xs text-[#A7C2D8]">
                        메시지를 열람하고 대화를 보내려면 먼저 방에 참여해야 합니다.
                      </p>
                      <button
                        type="button"
                        disabled={isJoiningRoomId === selectedRoom.roomId}
                        onClick={() => handleJoinOpenRoom(selectedRoom)}
                        className="min-h-[42px] px-5 py-2 btn-cyan-gradient font-bold rounded-xl text-xs disabled:opacity-60"
                      >
                        {isJoiningRoomId === selectedRoom.roomId ? '참여 중...' : '지금 방 참여하기'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-[#A7C2D8] text-sm text-center space-y-3">
                <p>왼쪽에서 참여할 채팅방을 선택하거나 새 방(공개/비공개)을 만들어 보세요.</p>
                <button
                  type="button"
                  onClick={() => setIsCreatingRoom(true)}
                  className="px-4 py-2 btn-cyan-gradient font-bold rounded-xl text-xs inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> 새 채팅방 만들기 (공개·비공개 설정)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODE 2: 1:1 DIRECT MESSAGES ================= */}
      {chatMode === 'dm' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* DM Threads & Angler Directory */}
          <div className="lg:col-span-4 bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-2xl p-4 space-y-5">
            <div className="space-y-2.5">
              <h4 className="text-sm font-bold text-[#F4FAFF] flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#36D6E8]" /> 내 1:1 개인 대화목록
              </h4>
              {dmThreads.length > 0 ? (
                <div className="space-y-2">
                  {dmThreads.map((t) => {
                    const partnerUid = t.user1Uid === currentUser.uid ? t.user2Uid : t.user1Uid;
                    const partnerName = t.user1Uid === currentUser.uid ? t.user2Name : t.user1Name;
                    const partnerPhoto = t.user1Uid === currentUser.uid ? t.user2Photo : t.user1Photo;
                    const isSelected = selectedDmPartner?.uid === partnerUid;

                    return (
                      <button
                        key={t.threadId}
                        type="button"
                        onClick={() => {
                          setSelectedDmPartner({
                            uid: partnerUid,
                            displayName: partnerName,
                            photoURL: partnerPhoto,
                            favoriteRegion: '전체',
                            isDiscoverable: true,
                          });
                          setConfirmDeleteDmThreadId(null);
                        }}
                        className={`w-full text-left p-3 rounded-xl border transition-all flex items-center gap-3 ${
                          isSelected
                            ? 'bg-[#0B2948]/95 border-[#36D6E8]'
                            : 'bg-[#061B33]/65 border-[#4B9FE8]/20 hover:border-[#4B9FE8]/45'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#36D6E8] to-[#4B9FE8] text-[#041529] text-xs font-bold flex items-center justify-center shrink-0 overflow-hidden">
                          {partnerPhoto ? (
                            <img
                              src={partnerPhoto}
                              alt={partnerName}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            partnerName.slice(0, 1)
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-[#F4FAFF] truncate">{partnerName}</span>
                            <span className="text-[10px] text-[#A7C2D8]">
                              {formatMessageTime(t.lastMessageAt)}
                            </span>
                          </div>
                          <p className="text-xs text-[#A7C2D8] truncate mt-0.5">
                            {maskProfanityText(t.lastMessageText)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-[#A7C2D8] bg-[#061B33]/55 p-3 rounded-xl border border-[#4B9FE8]/15">
                  아직 1:1 대화가 없습니다. 아래 낚시인 목록에서 대화 상대를 선택해 보세요.
                </p>
              )}
            </div>

            <div className="space-y-2.5 pt-3 border-t border-[#4B9FE8]/20">
              <h4 className="text-sm font-bold text-[#F4FAFF] flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-[#36D6E8]" /> 접속·등록된 낚시인 찾기
              </h4>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#A7C2D8] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder="닉네임 또는 해역(동해·남해 등) 검색"
                  className="w-full bg-[#061B33] border border-[#4B9FE8]/25 rounded-xl pl-8 pr-3 py-2 text-xs text-[#F4FAFF] placeholder-[#A7C2D8]/50"
                />
              </div>

              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {filteredProfiles.length > 0 ? (
                  filteredProfiles.map((p) => (
                    <button
                      key={p.uid}
                      type="button"
                      onClick={() => {
                        setSelectedDmPartner(p);
                        setConfirmDeleteDmMsgId(null);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl bg-[#061B33]/60 hover:bg-[#0B2948] border border-[#4B9FE8]/20 flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="text-[#F4FAFF] font-medium truncate">
                        {p.displayName}{' '}
                        <span className="text-[#36D6E8] font-normal">({p.favoriteRegion})</span>
                      </span>
                      <span className="text-[#36D6E8] font-semibold shrink-0">대화하기</span>
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-[#A7C2D8] py-2">
                    현재 다른 로그인 사용자가 아직 없습니다. 다른 Google 계정으로 접속하면 이곳에 표시됩니다.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Active 1:1 DM Conversation */}
          <div className="lg:col-span-8 bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-2xl flex flex-col min-h-[540px] max-h-[700px]">
            {selectedDmPartner ? (
              <>
                <div className="p-4 border-b border-[#4B9FE8]/20 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#0B2948] text-[#F4FAFF] font-bold flex items-center justify-center overflow-hidden border border-[#36D6E8]/40">
                      {selectedDmPartner.photoURL ? (
                        <img
                          src={selectedDmPartner.photoURL}
                          alt={selectedDmPartner.displayName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        selectedDmPartner.displayName.slice(0, 1)
                      )}
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-[#F4FAFF] flex items-center gap-1.5">
                        {selectedDmPartner.displayName}
                        <Lock className="w-3.5 h-3.5 text-[#36D6E8]" />
                      </h4>
                      <p className="text-xs text-[#A7C2D8]">
                        두 분만 읽을 수 있는 1:1 비공개 개인 메시지 · 비속어 * 자동 모자이크
                      </p>
                    </div>
                  </div>

                  {activeDmThread && (
                    confirmDeleteDmThreadId === activeDmThread.threadId ? (
                      <div className="inline-flex items-center gap-1.5 bg-red-950/70 border border-red-500/40 rounded-xl px-2.5 py-1">
                        <button
                          type="button"
                          disabled={isDeletingDm}
                          onClick={() => handleDeleteDmThread(activeDmThread.threadId)}
                          className="text-xs font-bold text-red-300 hover:text-red-200 px-1.5 py-1"
                        >
                          {isDeletingDm ? '삭제 중...' : '삭제 확인'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteDmThreadId(null)}
                          className="text-xs text-[#A7C2D8] hover:text-[#F4FAFF] px-1.5 py-1"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteDmThreadId(activeDmThread.threadId)}
                        className="min-h-[38px] px-3 py-1.5 bg-red-950/60 hover:bg-red-900/70 text-red-300 border border-red-500/30 rounded-xl text-xs font-semibold inline-flex items-center gap-1 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> 대화방 삭제
                      </button>
                    )
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#061B33]/35">
                  {dmMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-[#A7C2D8] text-xs space-y-2 py-12">
                      <Lock className="w-8 h-8 text-[#4B9FE8]/60" />
                      <p>
                        {selectedDmPartner.displayName}님과의 첫 번째 1:1 메시지를 보내보세요!
                      </p>
                    </div>
                  ) : (
                    dmMessages.map((msg) => {
                      const isMine = msg.senderId === currentUser.uid;
                      const canDelete = canDeleteDmMessage(
                        msg.senderId,
                        [currentUser.uid, selectedDmPartner.uid],
                        currentUser.uid
                      );
                      const displayText = maskProfanityText(msg.text);
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm space-y-1.5 ${
                              isMine
                                ? 'bg-gradient-to-br from-[#36D6E8]/90 to-[#4B9FE8]/90 text-[#041529] font-medium rounded-br-sm shadow'
                                : 'bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 text-[#F4FAFF] rounded-bl-sm'
                            }`}
                          >
                            {msg.sharedSpotName && (
                              <div className={`text-[11px] font-bold flex items-center gap-1 ${isMine ? 'text-[#041529]' : 'text-amber-200'}`}>
                                <MapPin className="w-3 h-3" /> 공유 포인트: {msg.sharedSpotName}
                              </div>
                            )}
                            <p className="whitespace-pre-wrap break-words leading-relaxed">{displayText}</p>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-[#A7C2D8]/70">
                              {formatMessageTime(msg.createdAt)}
                            </span>
                            {canDelete && activeDmThreadId && (
                              confirmDeleteDmMsgId === msg.id ? (
                                <span className="inline-flex items-center gap-1.5 bg-red-950/70 border border-red-500/40 rounded-lg px-2 py-0.5 text-[10px]">
                                  <button
                                    type="button"
                                    disabled={isDeletingDmMsg}
                                    onClick={() => handleDeleteDmMessage(msg, activeDmThreadId)}
                                    className="font-bold text-red-300 hover:text-red-200"
                                  >
                                    {isDeletingDmMsg ? '삭제 중...' : '삭제 확인'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteDmMsgId(null)}
                                    className="text-[#A7C2D8] hover:text-[#F4FAFF]"
                                  >
                                    취소
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteDmMsgId(msg.id)}
                                  aria-label="1:1 메시지 삭제"
                                  className="text-[10px] text-red-300 hover:text-red-200 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-red-950/50"
                                >
                                  <Trash2 className="w-3 h-3" /> 삭제
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={dmMessagesEndRef} />
                </div>

                <form
                  onSubmit={handleSendDmMessage}
                  className="p-3.5 border-t border-[#4B9FE8]/20 bg-[#061B33]/65 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setAttachSpotToDm((v) => !v)}
                      aria-pressed={attachSpotToDm}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors inline-flex items-center gap-1 ${
                        attachSpotToDm
                          ? 'bg-amber-950/80 text-amber-200 border-amber-500/40'
                          : 'bg-[#0B2948] text-[#A7C2D8] border-[#4B9FE8]/25'
                      }`}
                    >
                      <MapPin className="w-3 h-3" />
                      {attachSpotToDm
                        ? `✓ 포인트 첨부: ${activeSpotLabel}`
                        : `+ 내 포인트 첨부 (${activeSpotLabel})`}
                    </button>
                    <span className="text-[11px] text-[#A7C2D8]">
                      비속어는 * 표시로 자동 모자이크됩니다
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={dmMessageText}
                      onChange={(e) => setDmMessageText(e.target.value)}
                      placeholder={`${selectedDmPartner.displayName}님에게 1:1 메시지 보내기...`}
                      className="flex-1 bg-[#103653]/85 backdrop-blur-md border border-[#4B9FE8]/25 rounded-xl px-4 py-2.5 text-sm text-[#F4FAFF] placeholder-[#A7C2D8]/50 focus:outline-none focus:border-[#36D6E8]"
                    />
                    <button
                      type="submit"
                      disabled={isSendingDm || !dmMessageText.trim()}
                      className="min-h-[44px] px-4 py-2 btn-aqua-gradient font-bold rounded-xl text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" /> 전송
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#A7C2D8] space-y-2">
                <Lock className="w-10 h-10 text-[#4B9FE8]/60" />
                <p className="text-sm font-medium text-[#F4FAFF]">
                  왼쪽에서 1:1 대화 상대를 선택하세요
                </p>
                <p className="text-xs">
                  채팅방 참여자의 닉네임을 눌러서도 바로 1:1 개인 메시지를 시작할 수 있습니다.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function MessengerSection(props: MessengerSectionProps) {
  return (
    <MessengerErrorBoundary>
      <MessengerContent {...props} />
    </MessengerErrorBoundary>
  );
}
