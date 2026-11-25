import React, { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  MessageSquare,
  Plus,
  Trash2,
  Send,
  Lock,
  Globe,
  KeyRound,
  LogIn,
  LogOut,
  Users,
  MapPin,
  Edit3,
  AlertTriangle,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { SeaRegion } from '../utils/geo';
import {
  buildDmThreadId,
  generateInviteCode,
  maskProfanity,
  MAX_DISPLAY_NAME_LEN,
  MAX_PHOTO_URL_LEN,
  sanitizeMessageText,
  sortParticipantPair,
  truncateToLength,
  validateNewOpenRoomInput,
  validatePrivateInviteCode,
} from '../utils/messenger';

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

interface RoomRecord {
  roomId: string;
  title: string;
  region: SeaRegion;
  description: string;
  isPublic: boolean;
  inviteCode?: string;
  createdBy: string;
  creatorName: string;
  lastMessageText: string;
}

interface RoomMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  text: string;
  sharedSpotName: string;
}

interface PublicAngler {
  uid: string;
  displayName: string;
  photoURL: string;
  favoriteRegion: SeaRegion;
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
}

interface DmMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  sharedSpotName: string;
}

export const MessengerSection: React.FC<MessengerSectionProps> = ({
  currentUser,
  userNickname,
  onOpenNicknameModal,
  authLoading,
  authError,
  onGoogleLogin,
  onGoogleLogout,
  activeSpotLabel,
  activeRegion,
  prefilledShareSpot,
  onClearPrefilledShareSpot,
}) => {
  const [subMode, setSubMode] = useState<'rooms' | 'dm'>('rooms');
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [joinedRoomIds, setJoinedRoomIds] = useState<Set<string>>(new Set());
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [roomMessages, setRoomMessages] = useState<RoomMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);

  // Room creation modal/form state
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [newRoomRegion, setNewRoomRegion] = useState<SeaRegion>(activeRegion);
  const [newRoomPublic, setNewRoomPublic] = useState<boolean>(true);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  // Private room invite code join
  const [inviteJoinCode, setInviteJoinCode] = useState('');
  const [isJoiningByCode, setIsJoiningByCode] = useState(false);

  // 1:1 DM state
  const [anglers, setAnglers] = useState<PublicAngler[]>([]);
  const [dmThreads, setDmThreads] = useState<DmThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [dmMessages, setDmMessages] = useState<DmMessage[]>([]);

  // Message deletion state
  const [confirmDeleteMsgId, setConfirmDeleteMsgId] = useState<string | null>(null);
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);

  useEffect(() => {
    setConfirmDeleteMsgId(null);
  }, [selectedRoomId, selectedThreadId, subMode]);

  useEffect(() => {
    let cancelled = false;
    if (!currentUser) {
      setIsAdminUser(false);
      return;
    }
    currentUser
      .getIdToken()
      .then((token) =>
        fetch('/api/admin/status', {
          headers: { Authorization: `Bearer ${token}` },
        })
      )
      .then((res) => (res.ok ? res.json() : { isAdmin: false }))
      .then((data) => {
        if (!cancelled) setIsAdminUser(Boolean(data?.isAdmin));
      })
      .catch(() => {
        if (!cancelled) setIsAdminUser(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const myDisplayName = useMemo(
    () =>
      truncateToLength(
        userNickname || currentUser?.displayName || '바다낚시인',
        MAX_DISPLAY_NAME_LEN
      ),
    [currentUser?.displayName, userNickname]
  );
  const myPhoto = useMemo(
    () => truncateToLength(currentUser?.photoURL || '', MAX_PHOTO_URL_LEN),
    [currentUser?.photoURL]
  );

  useEffect(() => {
    if (prefilledShareSpot) {
      setChatInput(`[낚시 위치 공유] ${prefilledShareSpot}`);
      onClearPrefilledShareSpot();
    }
  }, [prefilledShareSpot, onClearPrefilledShareSpot]);

  // Subscribe to public rooms + user's created/joined rooms
  useEffect(() => {
    if (!currentUser) {
      setRooms([]);
      setJoinedRoomIds(new Set());
      setSelectedRoomId(null);
      return;
    }

    let publicDocs: RoomRecord[] = [];
    let myCreatedDocs: RoomRecord[] = [];
    let linkedPrivateDocs: RoomRecord[] = [];

    const mergeAndPublishRooms = () => {
      const map = new Map<string, RoomRecord>();
      for (const r of [...publicDocs, ...myCreatedDocs, ...linkedPrivateDocs]) {
        map.set(r.roomId, r);
      }
      const list = Array.from(map.values());
      setRooms(list);
      setSelectedRoomId((prev) => {
        if (prev && map.has(prev)) return prev;
        return list[0]?.roomId || null;
      });
    };

    const unsubPublic = onSnapshot(
      query(collection(db, 'open_rooms'), where('isPublic', '==', true), limit(40)),
      (snap) => {
        publicDocs = snap.docs.map((d) => ({ ...(d.data() as RoomRecord), roomId: d.id }));
        mergeAndPublishRooms();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'open_rooms/public')
    );

    const unsubOwn = onSnapshot(
      query(
        collection(db, 'open_rooms'),
        where('createdBy', '==', currentUser.uid),
        limit(30)
      ),
      (snap) => {
        myCreatedDocs = snap.docs.map((d) => ({ ...(d.data() as RoomRecord), roomId: d.id }));
        mergeAndPublishRooms();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'open_rooms/own')
    );

    const unsubLinks = onSnapshot(
      query(
        collection(db, 'user_room_links', currentUser.uid, 'rooms'),
        where('uid', '==', currentUser.uid),
        limit(40)
      ),
      (snap) => {
        const nextJoined = new Set<string>();
        const privs: RoomRecord[] = [];
        for (const d of snap.docs) {
          const data = d.data();
          nextJoined.add(d.id);
          if (data?.isPublic === false) {
            privs.push({
              roomId: d.id,
              title: String(data.title || '비공개 방'),
              region: (data.region as SeaRegion) || '전체',
              description: '초대 코드로 참여한 비공개 채팅방',
              isPublic: false,
              inviteCode: String(data.inviteCode || ''),
              createdBy: '',
              creatorName: '참여방',
              lastMessageText: '',
            });
          }
        }
        setJoinedRoomIds(nextJoined);
        linkedPrivateDocs = privs;
        mergeAndPublishRooms();
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `user_room_links/${currentUser.uid}/rooms`)
    );

    return () => {
      unsubPublic();
      unsubOwn();
      unsubLinks();
    };
  }, [currentUser]);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.roomId === selectedRoomId) || null,
    [rooms, selectedRoomId]
  );

  // Check membership directly & listen to messages when joined/host
  const [directMemberConfirmed, setDirectMemberConfirmed] = useState(false);

  useEffect(() => {
    if (!currentUser || !selectedRoomId) {
      setDirectMemberConfirmed(false);
      setRoomMessages([]);
      return;
    }

    const memberDocRef = doc(db, 'open_rooms', selectedRoomId, 'members', currentUser.uid);
    const unsubMember = onSnapshot(
      memberDocRef,
      (snap) => {
        setDirectMemberConfirmed(snap.exists());
      },
      () => setDirectMemberConfirmed(false)
    );

    return () => unsubMember();
  }, [currentUser, selectedRoomId]);

  const isMemberOfSelected =
    Boolean(currentUser && selectedRoom) &&
    (directMemberConfirmed ||
      joinedRoomIds.has(selectedRoom!.roomId) ||
      selectedRoom!.createdBy === currentUser!.uid);

  useEffect(() => {
    if (!currentUser || !selectedRoomId || !isMemberOfSelected) {
      setRoomMessages([]);
      return;
    }

    const q = query(
      collection(db, 'open_rooms', selectedRoomId, 'messages'),
      where('roomId', '==', selectedRoomId),
      orderBy('createdAt', 'asc'),
      limit(80)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRoomMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<RoomMessage, 'id'>) })));
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, `open_rooms/${selectedRoomId}/messages`);
      }
    );
    return () => unsub();
  }, [currentUser, selectedRoomId, isMemberOfSelected]);

  // 1:1 DM listeners
  useEffect(() => {
    if (!currentUser) {
      setAnglers([]);
      setDmThreads([]);
      setDmMessages([]);
      return;
    }

    const unsubProfiles = onSnapshot(
      query(collection(db, 'public_profiles'), where('isDiscoverable', '==', true), limit(40)),
      (snap) => {
        setAnglers(
          snap.docs
            .map((d) => d.data() as PublicAngler)
            .filter((u) => u.uid && u.uid !== currentUser.uid)
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'public_profiles')
    );

    const unsubThreads = onSnapshot(
      query(
        collection(db, 'dm_threads'),
        where('participantUids', 'array-contains', currentUser.uid),
        limit(30)
      ),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...(d.data() as DmThread), threadId: d.id }));
        setDmThreads(list);
        setSelectedThreadId((prev) => (prev && list.some((t) => t.threadId === prev) ? prev : list[0]?.threadId || null));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'dm_threads')
    );

    return () => {
      unsubProfiles();
      unsubThreads();
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !selectedThreadId) {
      setDmMessages([]);
      return;
    }
    const thread = dmThreads.find((t) => t.threadId === selectedThreadId);
    if (!thread) {
      setDmMessages([]);
      return;
    }
    const unsub = onSnapshot(
      query(
        collection(db, 'dm_threads', selectedThreadId, 'messages'),
        where('participantUids', 'array-contains', currentUser.uid),
        orderBy('createdAt', 'asc'),
        limit(80)
      ),
      (snap) => {
        setDmMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DmMessage, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `dm_threads/${selectedThreadId}/messages`)
    );
    return () => unsub();
  }, [currentUser, selectedThreadId, dmThreads]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setChatError(null);

    const validated = validateNewOpenRoomInput(newRoomTitle, newRoomDesc);
    if (!validated.valid) {
      setChatError(validated.error || '채팅방 제목을 확인해 주세요.');
      return;
    }

    setIsCreatingRoom(true);
    try {
      const roomId = `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const inviteCode = newRoomPublic ? '' : generateInviteCode(6);

      const batch = writeBatch(db);
      const roomRef = doc(db, 'open_rooms', roomId);
      const roomPayload: Record<string, unknown> = {
        roomId,
        title: validated.cleanTitle,
        region: newRoomRegion,
        description: validated.cleanDescription,
        isPublic: newRoomPublic,
        createdBy: currentUser.uid,
        creatorName: myDisplayName,
        lastMessageText: newRoomPublic
          ? '공개 채팅방이 열렸습니다.'
          : '초대 코드 전용 비공개 방이 열렸습니다.',
        lastMessageAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (!newRoomPublic) {
        roomPayload.inviteCode = inviteCode;
      }
      batch.set(roomRef, roomPayload);

      const memberPayload: Record<string, unknown> = {
        roomId,
        uid: currentUser.uid,
        displayName: myDisplayName,
        photoURL: myPhoto,
        joinedAt: serverTimestamp(),
      };
      if (!newRoomPublic) {
        memberPayload.inviteCode = inviteCode;
      }
      batch.set(doc(db, 'open_rooms', roomId, 'members', currentUser.uid), memberPayload);

      batch.set(doc(db, 'user_room_links', currentUser.uid, 'rooms', roomId), {
        roomId,
        uid: currentUser.uid,
        title: validated.cleanTitle,
        region: newRoomRegion,
        isPublic: newRoomPublic,
        inviteCode,
        joinedAt: serverTimestamp(),
      });

      if (!newRoomPublic) {
        batch.set(doc(db, 'room_invites', inviteCode), {
          inviteCode,
          roomId,
          title: validated.cleanTitle,
          region: newRoomRegion,
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();
      setSelectedRoomId(roomId);
      setShowCreateRoom(false);
      setNewRoomTitle('');
      setNewRoomDesc('');
    } catch (err: any) {
      setChatError(err?.message || '채팅방 생성 중 오류가 발생했습니다.');
      handleFirestoreError(err, OperationType.CREATE, 'open_rooms');
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleJoinPublicRoom = async (room: RoomRecord) => {
    if (!currentUser) return;
    setChatError(null);
    try {
      await setDoc(doc(db, 'open_rooms', room.roomId, 'members', currentUser.uid), {
        roomId: room.roomId,
        uid: currentUser.uid,
        displayName: myDisplayName,
        photoURL: myPhoto,
        joinedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'user_room_links', currentUser.uid, 'rooms', room.roomId), {
        roomId: room.roomId,
        uid: currentUser.uid,
        title: room.title,
        region: room.region,
        isPublic: true,
        inviteCode: '',
        joinedAt: serverTimestamp(),
      });
      setDirectMemberConfirmed(true);
    } catch (err: any) {
      setChatError(err?.message || '방 참여 중 오류가 발생했습니다.');
      handleFirestoreError(err, OperationType.WRITE, `open_rooms/${room.roomId}/members/${currentUser.uid}`);
    }
  };

  const handleJoinByInviteCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setChatError(null);

    const check = validatePrivateInviteCode(inviteJoinCode);
    if (!check.valid) {
      setChatError(check.error || '초대 코드를 확인해 주세요.');
      return;
    }

    setIsJoiningByCode(true);
    try {
      const invSnap = await getDoc(doc(db, 'room_invites', check.code));
      if (!invSnap.exists()) {
        setChatError('입력한 초대 코드에 해당하는 비공개 방을 찾을 수 없습니다.');
        return;
      }
      const inv = invSnap.data();
      const targetRoomId = String(inv.roomId);

      await setDoc(doc(db, 'open_rooms', targetRoomId, 'members', currentUser.uid), {
        roomId: targetRoomId,
        uid: currentUser.uid,
        displayName: myDisplayName,
        photoURL: myPhoto,
        inviteCode: check.code,
        joinedAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'user_room_links', currentUser.uid, 'rooms', targetRoomId), {
        roomId: targetRoomId,
        uid: currentUser.uid,
        title: String(inv.title || '비공개 방'),
        region: (inv.region as SeaRegion) || '전체',
        isPublic: false,
        inviteCode: check.code,
        joinedAt: serverTimestamp(),
      });

      setSelectedRoomId(targetRoomId);
      setInviteJoinCode('');
      setDirectMemberConfirmed(true);
    } catch (err: any) {
      setChatError(err?.message || '초대 코드 참여 중 오류가 발생했습니다.');
      handleFirestoreError(err, OperationType.WRITE, 'room_invites');
    } finally {
      setIsJoiningByCode(false);
    }
  };

  const handleDeleteRoom = async (room: RoomRecord) => {
    if (!currentUser) return;
    setChatError(null);
    try {
      const msgSnap = await getDocs(collection(db, 'open_rooms', room.roomId, 'messages'));
      for (const m of msgSnap.docs) {
        await deleteDoc(m.ref).catch(() => {});
      }
      const memSnap = await getDocs(collection(db, 'open_rooms', room.roomId, 'members'));
      for (const mem of memSnap.docs) {
        await deleteDoc(mem.ref).catch(() => {});
      }
      if (!room.isPublic && room.inviteCode) {
        await deleteDoc(doc(db, 'room_invites', room.inviteCode)).catch(() => {});
      }
      await deleteDoc(doc(db, 'user_room_links', currentUser.uid, 'rooms', room.roomId)).catch(() => {});
      await deleteDoc(doc(db, 'open_rooms', room.roomId));

      if (selectedRoomId === room.roomId) {
        setSelectedRoomId(null);
      }
    } catch (err: any) {
      setChatError(err?.message || '방 삭제 권한이 없거나 삭제 중 오류가 발생했습니다.');
      handleFirestoreError(err, OperationType.DELETE, `open_rooms/${room.roomId}`);
    }
  };

  const handleSendRoomMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedRoom) return;
    setChatError(null);

    const sanitized = sanitizeMessageText(chatInput);
    if (!sanitized) return;
    const finalText = maskProfanity(sanitized).maskedText;

    try {
      if (!isMemberOfSelected && selectedRoom.isPublic) {
        await handleJoinPublicRoom(selectedRoom);
      }

      const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await setDoc(doc(db, 'open_rooms', selectedRoom.roomId, 'messages', msgId), {
        roomId: selectedRoom.roomId,
        isPublic: selectedRoom.isPublic,
        senderId: currentUser.uid,
        senderName: myDisplayName,
        senderPhoto: myPhoto,
        text: finalText,
        sharedSpotName: '',
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'open_rooms', selectedRoom.roomId), {
        lastMessageText: finalText.slice(0, 120),
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});

      setChatInput('');
    } catch (err: any) {
      setChatError(err?.message || '메시지 전송 중 오류가 발생했습니다. 먼저 방에 참여해 주세요.');
      handleFirestoreError(err, OperationType.CREATE, `open_rooms/${selectedRoom.roomId}/messages`);
    }
  };

  const handleDeleteRoomMessage = async (msg: RoomMessage) => {
    if (!currentUser || !selectedRoom) return;
    const canDelete =
      msg.senderId === currentUser.uid ||
      selectedRoom.createdBy === currentUser.uid ||
      isAdminUser;
    if (!canDelete) {
      setChatError('본인이 보낸 메시지 또는 방장/관리자만 메시지를 삭제할 수 있습니다.');
      return;
    }

    setChatError(null);
    setDeletingMsgId(msg.id);
    try {
      await deleteDoc(doc(db, 'open_rooms', selectedRoom.roomId, 'messages', msg.id));
      const remaining = roomMessages.filter((item) => item.id !== msg.id);
      const latestMsg = remaining[remaining.length - 1];
      const wasLatest = roomMessages[roomMessages.length - 1]?.id === msg.id;
      if (wasLatest) {
        await updateDoc(doc(db, 'open_rooms', selectedRoom.roomId), {
          lastMessageText: latestMsg ? latestMsg.text.slice(0, 120) : '메시지가 삭제되었습니다.',
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      setConfirmDeleteMsgId(null);
    } catch (err: any) {
      setChatError(err?.message || '메시지 삭제 중 오류가 발생했습니다.');
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `open_rooms/${selectedRoom.roomId}/messages/${msg.id}`
      );
    } finally {
      setDeletingMsgId(null);
    }
  };

  const handleStartDm = async (target: PublicAngler) => {
    if (!currentUser) return;
    setChatError(null);
    try {
      const [u1, u2] = sortParticipantPair(currentUser.uid, target.uid);
      const threadId = buildDmThreadId(u1, u2);
      const threadRef = doc(db, 'dm_threads', threadId);
      const snap = await getDoc(threadRef);
      if (!snap.exists()) {
        const u1IsMe = u1 === currentUser.uid;
        await setDoc(threadRef, {
          threadId,
          user1Uid: u1,
          user1Name: u1IsMe ? myDisplayName : truncateToLength(target.displayName, MAX_DISPLAY_NAME_LEN),
          user1Photo: u1IsMe ? myPhoto : truncateToLength(target.photoURL || '', MAX_PHOTO_URL_LEN),
          user2Uid: u2,
          user2Name: u1IsMe ? truncateToLength(target.displayName, MAX_DISPLAY_NAME_LEN) : myDisplayName,
          user2Photo: u1IsMe ? truncateToLength(target.photoURL || '', MAX_PHOTO_URL_LEN) : myPhoto,
          participantUids: [u1, u2],
          lastMessageText: '1:1 대화가 시작되었습니다.',
          lastMessageAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      setSelectedThreadId(threadId);
    } catch (err: any) {
      setChatError(err?.message || '1:1 대화방 연결 중 오류가 발생했습니다.');
      handleFirestoreError(err, OperationType.WRITE, 'dm_threads');
    }
  };

  const handleSendDm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedThreadId) return;
    const thread = dmThreads.find((t) => t.threadId === selectedThreadId);
    if (!thread) return;

    const sanitized = sanitizeMessageText(chatInput);
    if (!sanitized) return;
    const finalText = maskProfanity(sanitized).maskedText;
    const recipientId = thread.user1Uid === currentUser.uid ? thread.user2Uid : thread.user1Uid;

    try {
      const msgId = `dmmsg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await setDoc(doc(db, 'dm_threads', selectedThreadId, 'messages', msgId), {
        threadId: selectedThreadId,
        senderId: currentUser.uid,
        senderName: myDisplayName,
        recipientId,
        participantUids: thread.participantUids,
        text: finalText,
        sharedSpotName: '',
        createdAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'dm_threads', selectedThreadId), {
        lastMessageText: finalText.slice(0, 120),
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      setChatInput('');
    } catch (err: any) {
      setChatError(err?.message || '1:1 메시지 전송 중 오류가 발생했습니다.');
      handleFirestoreError(err, OperationType.CREATE, `dm_threads/${selectedThreadId}/messages`);
    }
  };

  const handleDeleteDmMessage = async (msg: DmMessage) => {
    if (!currentUser || !selectedThreadId) return;
    if (msg.senderId !== currentUser.uid) {
      setChatError('1:1 대화에서는 본인이 보낸 메시지만 삭제할 수 있습니다.');
      return;
    }

    setChatError(null);
    setDeletingMsgId(msg.id);
    try {
      await deleteDoc(doc(db, 'dm_threads', selectedThreadId, 'messages', msg.id));
      const remaining = dmMessages.filter((item) => item.id !== msg.id);
      const latestMsg = remaining[remaining.length - 1];
      const wasLatest = dmMessages[dmMessages.length - 1]?.id === msg.id;
      if (wasLatest) {
        await updateDoc(doc(db, 'dm_threads', selectedThreadId), {
          lastMessageText: latestMsg ? latestMsg.text.slice(0, 120) : '메시지가 삭제되었습니다.',
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      setConfirmDeleteMsgId(null);
    } catch (err: any) {
      setChatError(err?.message || '1:1 메시지 삭제 중 오류가 발생했습니다.');
      handleFirestoreError(
        err,
        OperationType.DELETE,
        `dm_threads/${selectedThreadId}/messages/${msg.id}`
      );
    } finally {
      setDeletingMsgId(null);
    }
  };

  if (!currentUser) {
    return (
      <section className="glass-card rounded-2xl p-8 text-center space-y-4 max-w-2xl mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-[#36D6E8]/15 border border-[#36D6E8]/35 flex items-center justify-center mx-auto text-[#36D6E8]">
          <MessageSquare className="w-7 h-7" />
        </div>
        <h3 className="text-xl font-bold text-[#F4FAFF]">초보·동호인 낚시 메신저</h3>
        <p className="text-xs sm:text-sm text-[#A7C2D8] leading-relaxed">
          Google 계정으로 로그인하면 공개 오픈채팅방, 초대코드 비공개 방, 낚시인 1:1 대화 및 실시간 포인트 공유 기능을 바로 이용할 수 있습니다.
        </p>
        {authError && (
          <div className="p-3 bg-red-950/80 border border-red-500/40 rounded-xl text-xs text-red-200 flex items-center gap-2 justify-center">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{authError}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onGoogleLogin}
          disabled={authLoading}
          className="min-h-[44px] px-6 py-2.5 btn-cyan-gradient rounded-xl text-sm font-bold inline-flex items-center gap-2"
        >
          <LogIn className="w-4 h-4" /> Google 계정으로 시작하기
        </button>
      </section>
    );
  }

  return (
    <section className="glass-card rounded-2xl p-5 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#4B9FE8]/20 pb-4">
        <div>
          <h3 className="text-xl font-bold text-[#F4FAFF] flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-[#36D6E8]" /> 바다낚시 실시간 메신저
          </h3>
          <p className="text-xs text-[#A7C2D8] mt-0.5">
            내 닉네임: <strong className="text-[#36D6E8]">{myDisplayName}</strong> · 현재 선택 포인트:{' '}
            {activeSpotLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubMode('rooms')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              subMode === 'rooms' ? 'btn-cyan-gradient' : 'btn-aqua-gradient'
            }`}
          >
            오픈/비공개 방
          </button>
          <button
            type="button"
            onClick={() => setSubMode('dm')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              subMode === 'dm' ? 'btn-cyan-gradient' : 'btn-aqua-gradient'
            }`}
          >
            1:1 대화 ({dmThreads.length})
          </button>
          <button
            type="button"
            onClick={onOpenNicknameModal}
            className="px-2.5 py-1.5 rounded-lg bg-[#061B33] border border-[#4B9FE8]/30 text-[#A7C2D8] hover:text-[#F4FAFF] text-xs inline-flex items-center gap-1"
          >
            <Edit3 className="w-3.5 h-3.5" /> 닉네임
          </button>
          <button
            type="button"
            onClick={onGoogleLogout}
            className="px-2.5 py-1.5 rounded-lg bg-red-950/60 border border-red-500/30 text-red-200 text-xs inline-flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" /> 로그아웃
          </button>
        </div>
      </div>

      {chatError && (
        <div className="p-3 bg-red-950/80 border border-red-500/40 rounded-xl text-xs text-red-200 flex items-center justify-between gap-2">
          <span>{chatError}</span>
          <button type="button" onClick={() => setChatError(null)} className="underline">
            닫기
          </button>
        </div>
      )}

      {subMode === 'rooms' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left Room List & Creation */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#36D6E8]">채팅방 목록 ({rooms.length})</span>
              <button
                type="button"
                onClick={() => setShowCreateRoom((prev) => !prev)}
                className="px-2.5 py-1 rounded-lg btn-cyan-gradient text-xs font-bold inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> 방 만들기
              </button>
            </div>

            {showCreateRoom && (
              <form
                onSubmit={handleCreateRoom}
                className="bg-[#061B33]/90 border border-[#36D6E8]/40 rounded-xl p-3.5 space-y-2.5 text-xs"
              >
                <input
                  type="text"
                  required
                  value={newRoomTitle}
                  onChange={(e) => setNewRoomTitle(e.target.value)}
                  placeholder="채팅방 제목 (2~60자)"
                  className="w-full bg-[#0B2948] border border-[#4B9FE8]/30 rounded-lg px-3 py-2 text-[#F4FAFF]"
                />
                <input
                  type="text"
                  value={newRoomDesc}
                  onChange={(e) => setNewRoomDesc(e.target.value)}
                  placeholder="간단한 안내 문구 (선택)"
                  className="w-full bg-[#0B2948] border border-[#4B9FE8]/30 rounded-lg px-3 py-2 text-[#F4FAFF]"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={newRoomRegion}
                    onChange={(e) => setNewRoomRegion(e.target.value as SeaRegion)}
                    className="bg-[#0B2948] border border-[#4B9FE8]/30 rounded-lg px-2.5 py-2 text-[#F4FAFF]"
                  >
                    <option value="남해">남해</option>
                    <option value="서해">서해</option>
                    <option value="동해">동해</option>
                    <option value="제주">제주</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setNewRoomPublic((prev) => !prev)}
                    className={`rounded-lg px-2.5 py-2 font-bold border inline-flex items-center justify-center gap-1 ${
                      newRoomPublic
                        ? 'bg-emerald-950/60 border-emerald-400/40 text-emerald-200'
                        : 'bg-amber-950/60 border-amber-400/40 text-amber-200'
                    }`}
                  >
                    {newRoomPublic ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    {newRoomPublic ? '공개방' : '비공개방'}
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={isCreatingRoom}
                  className="w-full py-2 btn-cyan-gradient rounded-lg font-bold"
                >
                  {isCreatingRoom ? '생성 중...' : '방 생성하기'}
                </button>
              </form>
            )}

            {/* Invite Code Join */}
            <form onSubmit={handleJoinByInviteCode} className="flex gap-1.5">
              <div className="relative flex-1">
                <KeyRound className="w-3.5 h-3.5 text-[#A7C2D8] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={inviteJoinCode}
                  onChange={(e) => setInviteJoinCode(e.target.value)}
                  placeholder="비공개 초대코드 입력"
                  className="w-full bg-[#061B33] border border-[#4B9FE8]/25 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-[#F4FAFF]"
                />
              </div>
              <button
                type="submit"
                disabled={isJoiningByCode}
                className="px-3 py-1.5 btn-aqua-gradient rounded-lg text-xs font-bold shrink-0"
              >
                참여
              </button>
            </form>

            {/* Rooms List */}
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {rooms.map((room) => (
                <div
                  key={room.roomId}
                  onClick={() => setSelectedRoomId(room.roomId)}
                  className={`p-3 rounded-xl border cursor-pointer transition-colors space-y-1 ${
                    selectedRoomId === room.roomId
                      ? 'bg-[#124870] border-[#36D6E8]'
                      : 'bg-[#061B33]/75 border-[#4B9FE8]/20 hover:bg-[#0B2948]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#F4FAFF] flex items-center gap-1 truncate">
                      {room.isPublic ? (
                        <Globe className="w-3 h-3 text-[#36D6E8] shrink-0" />
                      ) : (
                        <Lock className="w-3 h-3 text-amber-300 shrink-0" />
                      )}
                      {room.title}
                    </span>
                    <span className="text-[10px] text-[#36D6E8] shrink-0">{room.region}</span>
                  </div>
                  <p className="text-[11px] text-[#A7C2D8] truncate">{room.lastMessageText}</p>
                  {!room.isPublic && room.inviteCode && (
                    <p className="text-[10px] font-mono text-amber-300">초대코드: {room.inviteCode}</p>
                  )}
                </div>
              ))}
              {rooms.length === 0 && (
                <p className="text-xs text-[#A7C2D8] py-4 text-center">
                  개설된 채팅방이 없습니다. 첫 채팅방을 만들어 보세요!
                </p>
              )}
            </div>
          </div>

          {/* Right Room Chat Pane */}
          <div className="lg:col-span-2 bg-[#061B33]/80 border border-[#4B9FE8]/25 rounded-xl flex flex-col h-[420px]">
            {selectedRoom ? (
              <>
                <div className="px-4 py-3 border-b border-[#4B9FE8]/20 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-[#F4FAFF] truncate">
                      {selectedRoom.title}
                    </h4>
                    <p className="text-[11px] text-[#A7C2D8] truncate">{selectedRoom.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isMemberOfSelected && selectedRoom.isPublic && (
                      <button
                        type="button"
                        onClick={() => void handleJoinPublicRoom(selectedRoom)}
                        className="px-3 py-1.5 btn-cyan-gradient rounded-lg text-xs font-bold"
                      >
                        방 참여하기
                      </button>
                    )}
                    {selectedRoom.createdBy === currentUser.uid && (
                      <button
                        type="button"
                        onClick={() => void handleDeleteRoom(selectedRoom)}
                        className="px-2.5 py-1.5 rounded-lg bg-red-950/75 hover:bg-red-900 text-red-200 border border-red-500/40 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> 방 삭제
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  {!isMemberOfSelected ? (
                    <div className="h-full flex flex-col items-center justify-center text-center space-y-3 text-xs text-[#A7C2D8]">
                      <p>메시지를 보고 대화를 보내려면 먼저 [방 참여하기]를 눌러 주세요.</p>
                      {selectedRoom.isPublic && (
                        <button
                          type="button"
                          onClick={() => void handleJoinPublicRoom(selectedRoom)}
                          className="px-4 py-2 btn-cyan-gradient rounded-xl font-bold"
                        >
                          지금 방 참여하기
                        </button>
                      )}
                    </div>
                  ) : roomMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-[#A7C2D8]">
                      아직 메시지가 없습니다. 첫 인사를 남겨 보세요!
                    </div>
                  ) : (
                    roomMessages.map((m) => {
                      const isMe = m.senderId === currentUser.uid;
                      const canDelete =
                        isMe || selectedRoom.createdBy === currentUser.uid || isAdminUser;
                      const isConfirming = confirmDeleteMsgId === m.id;
                      const isDeleting = deletingMsgId === m.id;
                      return (
                        <div
                          key={m.id}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] text-[#A7C2D8]">{m.senderName}</span>
                            {canDelete && (
                              isConfirming ? (
                                <span className="inline-flex items-center gap-1 text-[10px]">
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => void handleDeleteRoomMessage(m)}
                                    className="px-1.5 py-0.5 rounded bg-red-950/90 text-red-200 border border-red-500/40 font-bold hover:bg-red-900 disabled:opacity-50"
                                  >
                                    {isDeleting ? '삭제 중...' : '삭제 확인'}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isDeleting}
                                    onClick={() => setConfirmDeleteMsgId(null)}
                                    className="px-1.5 py-0.5 rounded bg-[#0B2948] text-[#A7C2D8] border border-[#4B9FE8]/25 hover:text-[#F4FAFF]"
                                  >
                                    취소
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  aria-label={`${m.senderName}의 메시지 삭제`}
                                  onClick={() => setConfirmDeleteMsgId(m.id)}
                                  className="text-[10px] text-[#A7C2D8]/80 hover:text-red-300 inline-flex items-center gap-0.5 transition-colors"
                                >
                                  <Trash2 className="w-3 h-3" /> 삭제
                                </button>
                              )
                            )}
                          </div>
                          <div
                            className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                              isMe
                                ? 'bg-[#36D6E8] text-[#041529] font-medium'
                                : 'bg-[#0B2948] text-[#F4FAFF] border border-[#4B9FE8]/25'
                            }`}
                          >
                            {m.text}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form
                  onSubmit={handleSendRoomMessage}
                  className="p-3 border-t border-[#4B9FE8]/20 flex items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={() => setChatInput(`[낚시 위치 공유] ${activeSpotLabel}`)}
                    className="p-2 rounded-lg bg-[#0B2948] text-[#36D6E8] border border-[#4B9FE8]/30 shrink-0"
                    title="현재 지도/기기 위치 공유"
                  >
                    <MapPin className="w-4 h-4" />
                  </button>
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="메시지를 입력하세요..."
                    className="flex-1 bg-[#0B2948] border border-[#4B9FE8]/30 rounded-xl px-3.5 py-2 text-xs text-[#F4FAFF] focus:outline-none focus:border-[#36D6E8]"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 btn-cyan-gradient rounded-xl text-xs font-bold inline-flex items-center gap-1 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" /> 전송
                  </button>
                </form>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-[#A7C2D8]">
                왼쪽 목록에서 채팅방을 선택하거나 새로 만들어 주세요.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* 1:1 DM Tab */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-[#36D6E8] flex items-center gap-1.5">
              <Users className="w-4 h-4" /> 접속 낚시인 ({anglers.length})
            </h4>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {anglers.map((u) => (
                <div
                  key={u.uid}
                  className="flex items-center justify-between gap-2 bg-[#061B33]/75 border border-[#4B9FE8]/20 rounded-xl p-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-[#F4FAFF] truncate">{u.displayName}</div>
                    <div className="text-[10px] text-[#36D6E8]">{u.favoriteRegion} 활동</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleStartDm(u)}
                    className="px-2.5 py-1 btn-cyan-gradient rounded-lg text-[11px] font-bold shrink-0"
                  >
                    1:1 대화
                  </button>
                </div>
              ))}
              {anglers.length === 0 && (
                <p className="text-xs text-[#A7C2D8] py-4 text-center">
                  현재 검색 가능한 다른 낚시인이 없습니다.
                </p>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 bg-[#061B33]/80 border border-[#4B9FE8]/25 rounded-xl flex flex-col h-[380px]">
            {selectedThreadId ? (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                  {dmMessages.map((m) => {
                    const isMe = m.senderId === currentUser.uid;
                    const isConfirming = confirmDeleteMsgId === m.id;
                    const isDeleting = deletingMsgId === m.id;
                    return (
                      <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] text-[#A7C2D8]">{m.senderName}</span>
                          {isMe && (
                            isConfirming ? (
                              <span className="inline-flex items-center gap-1 text-[10px]">
                                <button
                                  type="button"
                                  disabled={isDeleting}
                                  onClick={() => void handleDeleteDmMessage(m)}
                                  className="px-1.5 py-0.5 rounded bg-red-950/90 text-red-200 border border-red-500/40 font-bold hover:bg-red-900 disabled:opacity-50"
                                >
                                  {isDeleting ? '삭제 중...' : '삭제 확인'}
                                </button>
                                <button
                                  type="button"
                                  disabled={isDeleting}
                                  onClick={() => setConfirmDeleteMsgId(null)}
                                  className="px-1.5 py-0.5 rounded bg-[#0B2948] text-[#A7C2D8] border border-[#4B9FE8]/25 hover:text-[#F4FAFF]"
                                >
                                  취소
                                </button>
                              </span>
                            ) : (
                              <button
                                type="button"
                                aria-label="내 1:1 메시지 삭제"
                                onClick={() => setConfirmDeleteMsgId(m.id)}
                                className="text-[10px] text-[#A7C2D8]/80 hover:text-red-300 inline-flex items-center gap-0.5 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" /> 삭제
                              </button>
                            )
                          )}
                        </div>
                        <div
                          className={`max-w-[80%] px-3 py-2 rounded-xl text-xs ${
                            isMe ? 'bg-[#36D6E8] text-[#041529]' : 'bg-[#0B2948] text-[#F4FAFF]'
                          }`}
                        >
                          {m.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <form
                  onSubmit={handleSendDm}
                  className="p-3 border-t border-[#4B9FE8]/20 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="1:1 메시지를 입력하세요..."
                    className="flex-1 bg-[#0B2948] border border-[#4B9FE8]/30 rounded-xl px-3.5 py-2 text-xs text-[#F4FAFF]"
                  />
                  <button type="submit" className="px-4 py-2 btn-cyan-gradient rounded-xl text-xs font-bold">
                    전송
                  </button>
                </form>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-[#A7C2D8]">
                왼쪽 목록에서 낚시인을 선택해 1:1 대화를 시작하세요.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
