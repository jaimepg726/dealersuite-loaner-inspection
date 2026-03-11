"""DealerSuite — Video Frame Extraction Service
Extracts JPEG frames at 1 fps from a walkaround video using ffmpeg.
Runs as a background task so uploads remain instant for porters.
"""

import asyncio
import logging
import tempfile
from pathlib import Path

logger = logging.getLogger(__name__)


async def extract_frames(video_bytes: bytes, inspection_id: int) -> list[bytes]:
    """
    Extract JPEG frames at 1 frame per second from raw video bytes.

    Uses ffmpeg subprocess (must be installed in the container).
    Returns a list of JPEG byte strings, one per second of video.
    Returns an empty list if ffmpeg is unavailable or the video is invalid.
    """
    if not video_bytes:
        return []

    with tempfile.TemporaryDirectory(prefix=f"inspection_frames_{inspection_id}_") as tmpdir:
        input_path = Path(tmpdir) / "input.mp4"
        frames_dir = Path(tmpdir) / "frames"
        frames_dir.mkdir()

        input_path.write_bytes(video_bytes)

        cmd = [
            "ffmpeg",
            "-i", str(input_path),
            "-vf", "fps=1",
            "-q:v", "5",          # JPEG quality 1-31, lower = better
            str(frames_dir / "frame_%03d.jpg"),
            "-y",
            "-loglevel", "error",
        ]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
        except FileNotFoundError:
            logger.warning(
                "ffmpeg not found — frame extraction skipped for inspection %d. "
                "Install ffmpeg in the Docker container to enable this feature.",
                inspection_id,
            )
            return []
        except asyncio.TimeoutError:
            logger.error("ffmpeg timed out for inspection %d", inspection_id)
            try:
                proc.kill()
            except Exception:
                pass
            return []

        if proc.returncode != 0:
            logger.error(
                "ffmpeg exited %d for inspection %d: %s",
                proc.returncode,
                inspection_id,
                stderr.decode(errors="replace"),
            )
            return []

        frame_files = sorted(frames_dir.glob("frame_*.jpg"))
        if not frame_files:
            logger.warning("ffmpeg produced no frames for inspection %d", inspection_id)
            return []

        frame_bytes_list = [f.read_bytes() for f in frame_files]
        logger.info(
            "Extracted %d frames from video for inspection %d",
            len(frame_bytes_list),
            inspection_id,
        )
        return frame_bytes_list
