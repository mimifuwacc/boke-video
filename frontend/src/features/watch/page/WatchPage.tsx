import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { AppConfig } from "../../../shared/config/config";
import { AppHeader } from "../../../shared/ui/AppHeader";
import { AppShell } from "../../../shared/ui/AppShell";
import { cn } from "../../../shared/ui/classNames";
import {
  type CommentCreateRequest,
  type CommentDirection,
  type CommentFontSize,
  type CommentMessage,
  commentColors,
  type OwnerProfileMessage,
} from "../../comments/model/types";
import { NotFoundPage } from "../../notFound/page/NotFoundPage";
import { startVideoPlayback } from "../../player/lib/oven_media_engine_player";
import { useRooms } from "../../rooms/model/useRooms";
import {
  autoplayNoticeDevice,
  mutedAutoplayNotice,
} from "../lib/autoplay_audio";
import { isCommentSubmitShortcut } from "../lib/comment_shortcuts";
import { autoQualityId } from "../lib/stream_quality";
import { useCommentRenderer } from "../model/useCommentRenderer";
import { useCommentSocket } from "../model/useCommentSocket";
import { useFullscreen } from "../model/useFullscreen";
import { usePictureInPicture } from "../model/usePictureInPicture";
import { useRoomActivity } from "../model/useRoomActivity";
import { useStreamPlayer } from "../model/useStreamPlayer";
import { CommentForm } from "../ui/CommentForm";
import { CommentSidebar } from "../ui/CommentSidebar";
import { WatchPlayer } from "../ui/WatchPlayer";
import { WatchProgramHeader } from "../ui/WatchProgramHeader";

type WatchPageProps = {
  config: AppConfig;
};

export function WatchPage({ config }: WatchPageProps) {
  const { rooms } = useRooms(config);
  const queryRoomId = new URLSearchParams(location.search).get("room");
  const selectedRoomId = queryRoomId ?? rooms[0]?.id ?? "";

  if (queryRoomId === null && rooms.length > 0 && selectedRoomId !== "") {
    history.replaceState(
      null,
      "",
      `/watch?room=${encodeURIComponent(selectedRoomId)}`,
    );
  }

  const stageRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [body, setBody] = useState("");
  const [isPaused, setIsPaused] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [selectedDirection, setSelectedDirection] =
    useState<CommentDirection>("rightToLeft");
  const [selectedSize, setSelectedSize] = useState<CommentFontSize>("medium");
  const [selectedColor, setSelectedColor] = useState<string>(commentColors[0]);
  const [commentsVisible, setCommentsVisible] = useState(true);
  const [selectedQualityId, setSelectedQualityId] = useState(autoQualityId);
  const [ownerDisplayNamesByRoomId, setOwnerDisplayNamesByRoomId] = useState<
    Record<string, string>
  >({});
  const { commentsLayerRef, renderComment } = useCommentRenderer();
  const {
    comments,
    elapsedSeconds,
    hasOlderComments,
    isLoadingOlderComments,
    loadOlderComments,
    recordComment,
    roomNotFound,
    stats,
    streamEnded,
    updatePresence,
  } = useRoomActivity(config, selectedRoomId);
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const [lastSelectedRoom, setLastSelectedRoom] = useState(selectedRoom);
  useEffect(() => {
    if (selectedRoom !== null) {
      setLastSelectedRoom(selectedRoom);
    }
  }, [selectedRoom]);
  const visibleRoom = selectedRoom ?? lastSelectedRoom;
  const ownerDisplayName =
    visibleRoom === null
      ? undefined
      : ownerDisplayNamesByRoomId[visibleRoom.id];
  const visibleRoomWithOwner =
    visibleRoom === null || ownerDisplayName === undefined
      ? visibleRoom
      : { ...visibleRoom, ownerDisplayName };
  const streamStatus =
    stats?.streamStatus ?? visibleRoom?.streamStatus ?? "waiting";
  const commentsDisabled = streamEnded || streamStatus === "ended";
  const activeRoomId = roomNotFound || commentsDisabled ? "" : selectedRoomId;
  const renderAndRecordComment = (message: CommentMessage): void => {
    if (commentsVisible) {
      renderComment(message);
    }
    recordComment(message);
  };
  const updateOwnerProfile = (message: OwnerProfileMessage): void => {
    setOwnerDisplayNamesByRoomId((current) => ({
      ...current,
      [message.roomId]: message.ownerDisplayName,
    }));
  };
  const { sendComment } = useCommentSocket(
    config,
    activeRoomId,
    renderAndRecordComment,
    updateOwnerProfile,
    updatePresence,
  );
  const {
    dismissMutedAutoplayNotice,
    isManualPlaybackRequired,
    isMutedAutoplay,
    isStreamLoading,
    playbackQualities,
    streamMessage,
  } = useStreamPlayer(
    config,
    activeRoomId,
    streamStatus,
    videoRef,
    selectedQualityId,
    setSelectedQualityId,
  );
  const { canToggleFullscreen, isFullscreen, toggleFullscreen } = useFullscreen(
    stageRef,
    videoRef,
  );
  const {
    canTogglePictureInPicture,
    isPictureInPicture,
    togglePictureInPicture,
  } = usePictureInPicture(videoRef);
  const autoplayAudioNotice = mutedAutoplayNotice(
    isMutedAutoplay,
    autoplayNoticeDevice(navigator),
  );

  if (selectedRoomId === "" || (stats === null && !roomNotFound)) {
    return null;
  }

  if (roomNotFound) {
    return <NotFoundPage />;
  }

  const updatePlayerState = (): void => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    setIsPaused(video.paused);
    setIsMuted(video.muted);
  };

  const submitComment = (): void => {
    if (commentsDisabled) {
      return;
    }
    const request: CommentCreateRequest = {
      body,
      direction: selectedDirection,
      color: selectedColor,
      fontSize: selectedSize,
    };
    sendComment(request);
    setBody("");
  };

  const submitCommentByShortcut = (
    event: KeyboardEvent<HTMLTextAreaElement>,
  ): void => {
    if (!isCommentSubmitShortcut(event)) {
      return;
    }
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const togglePlayback = async (): Promise<void> => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    if (video.paused) {
      await startVideoPlayback(video, { sound: "unmute" });
    } else {
      video.pause();
    }
    updatePlayerState();
  };

  const toggleMuted = (): void => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    video.muted = !video.muted;
    if (!video.muted) {
      dismissMutedAutoplayNotice();
    }
    updatePlayerState();
  };

  return (
    <AppShell>
      <AppHeader
        section="LIVE"
        links={[
          { href: "/", label: "枠一覧" },
          { href: "/admin", label: "管理" },
          { href: "/user", label: "ユーザー" },
          { href: "/support", label: "サポート" },
        ]}
      />
      <WatchProgramHeader
        selectedRoom={visibleRoomWithOwner}
        streamStatus={streamStatus}
      />
      {autoplayAudioNotice !== null ? (
        <section
          className={cn(
            "mx-auto mb-2 w-[min(720px,100%)]",
            "border border-[#777777] bg-[#111111] px-3 py-2 text-white",
            "shadow-[2px_2px_0_rgb(0_0_0_/_25%),inset_1px_1px_0_rgb(255_255_255_/_16%)]",
          )}
        >
          <p className="m-0 min-w-0 text-xs leading-[1.45] font-extrabold [overflow-wrap:anywhere] [text-shadow:1px_1px_0_#000000]">
            {autoplayAudioNotice.message}
          </p>
        </section>
      ) : null}
      <section className="grid grid-cols-[minmax(0,1fr)_360px] gap-2 max-[1040px]:grid-cols-1">
        <main
          className={cn(
            "relative min-w-0 border border-[#8c8c8c] bg-[#eeeeee] p-[5px]",
            "shadow-[inset_1px_1px_0_#ffffff,inset_-1px_-1px_0_#b8b8b8]",
          )}
        >
          <WatchPlayer
            commentsVisible={commentsVisible}
            commentsLayerRef={commentsLayerRef}
            elapsedSeconds={elapsedSeconds}
            isMuted={isMuted}
            isMutedAutoplay={isMutedAutoplay}
            isPaused={isPaused}
            canToggleFullscreen={canToggleFullscreen}
            canTogglePictureInPicture={canTogglePictureInPicture}
            isFullscreen={isFullscreen}
            isPictureInPicture={isPictureInPicture}
            isManualPlaybackRequired={isManualPlaybackRequired}
            isStreamLoading={isStreamLoading}
            playbackQualities={playbackQualities}
            selectedQualityId={selectedQualityId}
            onCommentsVisibleChange={setCommentsVisible}
            onQualityChange={setSelectedQualityId}
            onToggleFullscreen={toggleFullscreen}
            onToggleMuted={toggleMuted}
            onTogglePictureInPicture={togglePictureInPicture}
            onTogglePlayback={togglePlayback}
            onUpdatePlayerState={updatePlayerState}
            stageRef={stageRef}
            streamMessage={streamMessage}
            streamStatus={streamStatus}
            videoRef={videoRef}
          />
          <CommentForm
            body={body}
            disabled={commentsDisabled}
            selectedColor={selectedColor}
            selectedDirection={selectedDirection}
            selectedSize={selectedSize}
            onBodyChange={setBody}
            onColorChange={setSelectedColor}
            onDirectionChange={setSelectedDirection}
            onShortcut={submitCommentByShortcut}
            onSizeChange={setSelectedSize}
            onSubmit={submitComment}
          />
        </main>
        <CommentSidebar
          comments={comments}
          hasOlderComments={hasOlderComments}
          isLoadingOlderComments={isLoadingOlderComments}
          onLoadOlderComments={loadOlderComments}
          stats={stats}
        />
      </section>
    </AppShell>
  );
}
