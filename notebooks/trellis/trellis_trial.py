"""TRELLIS (microsoft/TRELLIS-image-large): one picture in, a 3D model out, on a Kaggle T4.

The Kaggle notebook (trellis-trial.ipynb, beside this file) pulls this folder from GitHub and calls these functions,
so a change here reaches Kaggle with a push and a re-run of the notebook's first cell.

    install()                         once per session: packages, two compiled renderers, TRELLIS with its patches
    pipe = load()                     once per session: the model on the GPU
    image, name = read_image(...)     an upload, a URL, a file or a TRELLIS sample
    prepped = show_input(pipe, image) background removed, side by side with the input
    out = generate(pipe, prepped, seed=1, ...)
    preview(out, name, seed)          a turning video: colour and the mesh's normals
    export(out, name, seed, ...)      a GLB with a download link and a viewer
    compare_seeds(pipe, prepped, [1, 2, 3, 4])
    multi(pipe, [paths or URLs], ...)

Nothing here holds state: the notebook keeps `pipe` and `out`, so reloading this module never drops the model.
"""
import io
import os
import shutil
import subprocess
import sys
import textwrap
import time

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = "/tmp/trellis-work"                 # sources and builds: kept out of the notebook's saved output
TRELLIS_DIR = f"{WORK}/TRELLIS"
TRELLIS_COMMIT = "193e0502b5cb3eb5997ec457d5340e95d09b158e"   # the commit the patches below were written against
OUT = "/kaggle/working/out"                # results: the notebook's Output tab
UA = {"User-Agent": "trellis-trial-notebook"}

T4_BUILD = {"TORCH_CUDA_ARCH_LIST": "7.5", "MAX_JOBS": "4"}   # compile for the T4 only: much faster


# ---------------------------------------------------------------- install

def _run(title, cmd, env=None):
    t = time.time()
    print(f"▸ {title} …", end=" ", flush=True)
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True, env={**os.environ, **(env or {})})
    if p.returncode != 0:
        print("FAILED")
        print(textwrap.indent((p.stdout + p.stderr)[-4000:], "    "))
        raise RuntimeError(f"Step failed: {title}")
    print(f"done ({time.time() - t:.0f}s)")


def _patch(path, old, new):
    s = open(path).read()
    if new not in s:
        open(path, "w").write(s.replace(old, new))


def _installed(module):
    return subprocess.run([sys.executable, "-c", f"import {module}"], capture_output=True).returncode == 0


def install():
    """Fits everything to Kaggle's own PyTorch. Steps already done in this session are skipped."""
    info = subprocess.run([sys.executable, "-c", "import torch,sys;print(torch.__version__.split('+')[0], torch.version.cuda, sys.version.split()[0])"],
                          capture_output=True, text=True).stdout.split()
    if len(info) < 2 or info[1] == "None":
        raise RuntimeError("PyTorch with CUDA isn't installed: switch the accelerator to GPU T4 x2 and restart the session.")
    torch_v, cuda_v, py_v = info
    print(f"Using Kaggle's PyTorch {torch_v} (CUDA {cuda_v}) on Python {py_v}")

    # No xformers: its builds for new PyTorch need extra kernels (mslk) that don't cover the T4. TRELLIS's attention
    # runs on PyTorch's scaled_dot_product_attention instead (patched in below).
    _run("PyTorch attention works on this GPU",
         f"{sys.executable} -c \"import torch,torch.nn.functional as F;q=torch.randn(2,8,64,64,device='cuda',dtype=torch.half);F.scaled_dot_product_attention(q,q,q)\"")
    if not _installed("spconv"):
        spconv = "spconv-cu126" if tuple(map(int, cuda_v.split(".")[:2])) >= (12, 6) else "spconv-cu124"
        _run(f"{spconv} (sparse convolutions)", f"pip install -q {spconv}")
    _run("Python packages",
         "pip install -q pillow imageio imageio-ffmpeg tqdm easydict opencv-python-headless scipy ninja "
         "rembg onnxruntime trimesh xatlas pyvista pymeshfix igraph plyfile ipywidgets")
    if not _installed("utils3d"):
        _run("utils3d", "pip install -q git+https://github.com/EasternJournalist/utils3d.git@9a4eb15e4021b67b12c460c7057d642626897ec8")

    os.makedirs(WORK, exist_ok=True)
    if not os.path.isdir(TRELLIS_DIR):
        _run("TRELLIS source", f"git clone -q --recursive https://github.com/microsoft/TRELLIS.git {TRELLIS_DIR} && "
                               f"cd {TRELLIS_DIR} && git checkout -q {TRELLIS_COMMIT} && git submodule update -q --init --recursive")

    if not _installed("nvdiffrast.torch"):
        _run("nvdiffrast (compiling)",
             f"rm -rf {WORK}/nvdiffrast && git clone -q https://github.com/NVlabs/nvdiffrast.git {WORK}/nvdiffrast && "
             f"pip install -q --no-build-isolation {WORK}/nvdiffrast", env=T4_BUILD)
    if not _installed("diff_gaussian_rasterization"):
        dgr = f"{WORK}/mip-splatting/submodules/diff-gaussian-rasterization"
        _run("diff-gaussian-rasterization source",
             f"rm -rf {WORK}/mip-splatting && git clone -q --recursive https://github.com/autonomousvision/mip-splatting.git {WORK}/mip-splatting")
        h = f"{dgr}/cuda_rasterizer/rasterizer_impl.h"   # newer compilers need <cstdint> spelled out
        s = open(h).read()
        if "<cstdint>" not in s:
            open(h, "w").write("#include <cstdint>\n" + s)
        _run("diff-gaussian-rasterization (compiling)", f"pip install -q --no-build-isolation {dgr}", env=T4_BUILD)

    # So TRELLIS doesn't need kaolin (imported for a debug check) or open3d (text-to-3D only) for image-to-3D.
    _patch(f"{TRELLIS_DIR}/trellis/representations/mesh/flexicubes/flexicubes.py",
           "from kaolin.utils.testing import check_tensor",
           "def check_tensor(*args, **kwargs): return True   # kaolin's debug check, not needed")
    _patch(f"{TRELLIS_DIR}/trellis/pipelines/__init__.py",
           "from .trellis_text_to_3d import TrellisTextTo3DPipeline",
           "try:\n    from .trellis_text_to_3d import TrellisTextTo3DPipeline   # needs open3d; only for text-to-3D\nexcept ImportError:\n    pass")
    # Sparse attention only offers xformers or flash-attention: its xformers calls go to sdpa_xops.py (beside this file).
    sa = f"{TRELLIS_DIR}/trellis/modules/sparse/attention"
    shutil.copy(f"{HERE}/sdpa_xops.py", f"{sa}/sdpa_xops.py")
    for f in ("full_attn.py", "serialized_attn.py", "windowed_attn.py"):
        _patch(f"{sa}/{f}", "import xformers.ops as xops", "from . import sdpa_xops as xops")
    print("All set.")


# ---------------------------------------------------------------- model

def load():
    os.environ.setdefault("CUDA_VISIBLE_DEVICES", "0")              # one T4: the model doesn't split across cards
    os.environ["ATTN_BACKEND"] = "sdpa"                             # dense attention: PyTorch's own kernels
    os.environ["SPARSE_ATTN_BACKEND"] = "xformers"                  # sparse: TRELLIS's xformers path, patched to sdpa_xops
    os.environ["SPCONV_ALGO"] = "native"                            # skips a slow benchmark on the first run
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    if TRELLIS_DIR not in sys.path:
        sys.path.insert(0, TRELLIS_DIR)
    import torch
    from trellis.pipelines import TrellisImageTo3DPipeline

    t = time.time()
    pipe = TrellisImageTo3DPipeline.from_pretrained("microsoft/TRELLIS-image-large")
    pipe.cuda()
    gb = 2 ** 30
    print(f"Loaded in {time.time() - t:.0f}s on {torch.cuda.get_device_name(0)}; GPU memory in use "
          f"{torch.cuda.memory_allocated() / gb:.1f} of {torch.cuda.get_device_properties(0).total_memory / gb:.0f} GB")
    return pipe


# ---------------------------------------------------------------- input

def samples():
    return sorted(os.listdir(f"{TRELLIS_DIR}/assets/example_image"))


def upload_widget():
    import ipywidgets as widgets
    return widgets.FileUpload(accept="image/*", multiple=False, description="Upload image")


def _uploaded(w):
    v = getattr(w, "value", None)
    if not v:
        return None
    if isinstance(v, dict):                    # ipywidgets 7
        return next(iter(v.values()))["content"]
    return bytes(v[0]["content"])              # ipywidgets 8


def _open(src):
    from PIL import Image
    if str(src).startswith("http"):
        import requests
        r = requests.get(src, timeout=30, headers=UA)
        r.raise_for_status()
        return Image.open(io.BytesIO(r.content))
    return Image.open(src)


def read_image(upload=None, url="", path="", sample="typical_misc_storage_chest.png"):
    """The first one given wins: upload, url, path, then the sample. Returns (image, name for the output files)."""
    from PIL import Image
    data = _uploaded(upload) if upload is not None else None
    if data:
        image, src = Image.open(io.BytesIO(data)), "upload"
    elif url:
        image, src = _open(url), url
    elif path:
        image, src = _open(path), path
    else:
        image, src = _open(f"{TRELLIS_DIR}/assets/example_image/{sample}"), sample
    image = image.convert("RGBA") if image.mode in ("RGBA", "LA", "P") else image.convert("RGB")
    name = os.path.splitext(os.path.basename(str(src).split("?")[0]))[0] or "input"
    return image, name


def show_input(pipe, image):
    """What the model actually sees: background removed, object centred and cropped. Returns that image."""
    import matplotlib.pyplot as plt
    prepped = pipe.preprocess_image(image)
    fig, ax = plt.subplots(1, 2, figsize=(9, 4.5))
    ax[0].imshow(image); ax[0].set_title(f"Input ({image.size[0]}×{image.size[1]})")
    ax[1].imshow(prepped); ax[1].set_title("What TRELLIS sees")
    for a in ax:
        a.axis("off")
    plt.tight_layout(); plt.show()
    return prepped


# ---------------------------------------------------------------- generate and look

def _params(ss_steps, ss_cfg, slat_steps, slat_cfg):
    return dict(sparse_structure_sampler_params={"steps": ss_steps, "cfg_strength": ss_cfg},
                slat_sampler_params={"steps": slat_steps, "cfg_strength": slat_cfg})


def generate(pipe, prepped, seed=1, ss_steps=12, ss_cfg=7.5, slat_steps=12, slat_cfg=3.0):
    import torch
    torch.cuda.reset_peak_memory_stats()
    t = time.time()
    out = pipe.run(prepped, seed=seed, preprocess_image=False, formats=["gaussian", "mesh"],
                   **_params(ss_steps, ss_cfg, slat_steps, slat_cfg))
    mesh = out["mesh"][0]
    print(f"Generated in {time.time() - t:.0f}s · peak GPU memory {torch.cuda.max_memory_allocated() / 2**30:.1f} GB · "
          f"raw mesh {mesh.vertices.shape[0]:,} vertices, {mesh.faces.shape[0]:,} faces · "
          f"{out['gaussian'][0].get_xyz.shape[0]:,} Gaussians")
    return out


def preview(out, name, seed, frames=120):
    """A turning video, 30 fps: left the coloured Gaussians, right the mesh's surface normals."""
    import imageio
    import numpy as np
    from IPython.display import Video
    from trellis.utils import render_utils
    os.makedirs(OUT, exist_ok=True)
    t = time.time()
    color = render_utils.render_video(out["gaussian"][0], num_frames=frames)["color"]
    normal = render_utils.render_video(out["mesh"][0], num_frames=frames)["normal"]
    path = f"{OUT}/{name}_seed{seed}.mp4"
    imageio.mimsave(path, [np.concatenate([c, n], axis=1) for c, n in zip(color, normal)], fps=30)
    print(f"Rendered in {time.time() - t:.0f}s → {path}")
    return Video(path, embed=True, width=768, html_attributes="controls autoplay loop muted")


def export(out, name, seed, simplify=0.95, texture_size=1024, viewer=True):
    """A GLB in the Output tab, a download link and (in the live session) a 3D viewer. Returns the file's path."""
    import base64
    from IPython.display import HTML, FileLink, display
    from trellis.utils import postprocessing_utils
    os.makedirs(OUT, exist_ok=True)
    t = time.time()
    glb = postprocessing_utils.to_glb(out["gaussian"][0], out["mesh"][0], simplify=simplify, texture_size=texture_size, verbose=False)
    path = f"{OUT}/{name}_seed{seed}.glb"
    glb.export(path)
    ext = glb.bounding_box.extents
    print(f"Exported in {time.time() - t:.0f}s → {path} ({os.path.getsize(path) / 2**20:.1f} MB, {len(glb.faces):,} faces, "
          f"size in model units {ext[0]:.2f} × {ext[1]:.2f} × {ext[2]:.2f})")
    display(FileLink(os.path.relpath(path, "/kaggle/working")))
    if viewer:
        b64 = base64.b64encode(open(path, "rb").read()).decode()
        display(HTML(f'''<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>
<model-viewer src="data:model/gltf-binary;base64,{b64}" camera-controls auto-rotate shadow-intensity="1"
  style="width:100%;height:480px;background:#eef1f5;border-radius:6px"></model-viewer>'''))
    return path


def compare_seeds(pipe, prepped, seeds=(1, 2, 3, 4), ss_steps=12, ss_cfg=7.5, slat_steps=12, slat_cfg=3.0):
    """One still per seed, side by side (about 40 s a seed)."""
    import matplotlib.pyplot as plt
    import numpy as np
    import torch
    from trellis.utils import render_utils
    stills = []
    for s in seeds:
        o = pipe.run(prepped, seed=s, preprocess_image=False, formats=["gaussian"], **_params(ss_steps, ss_cfg, slat_steps, slat_cfg))
        stills.append(render_utils.render_video(o["gaussian"][0], num_frames=1)["color"][0])
        del o
        torch.cuda.empty_cache()
    fig, ax = plt.subplots(1, len(seeds), figsize=(3.2 * len(seeds), 3.4))
    for a, s, im in zip(np.atleast_1d(ax), seeds, stills):
        a.imshow(im); a.set_title(f"seed {s}"); a.axis("off")
    plt.tight_layout(); plt.show()


def multi(pipe, sources=(), seed=1, ss_steps=12, ss_cfg=7.5, slat_steps=12, slat_cfg=3.0, frames=120,
          simplify=0.95, texture_size=1024):
    """One model from several photos of the same object (paths or URLs); TRELLIS's own example set when empty."""
    import imageio
    from IPython.display import Video
    from trellis.utils import postprocessing_utils, render_utils
    sources = list(sources) or [f"{TRELLIS_DIR}/assets/example_multi_image/character_{i}.png" for i in (1, 2, 3)]
    out = pipe.run_multi_image([_open(s) for s in sources], seed=seed, formats=["gaussian", "mesh"],
                               **_params(ss_steps, ss_cfg, slat_steps, slat_cfg))
    os.makedirs(OUT, exist_ok=True)
    video = f"{OUT}/multi_seed{seed}.mp4"
    imageio.mimsave(video, render_utils.render_video(out["gaussian"][0], num_frames=frames)["color"], fps=30)
    glb = f"{OUT}/multi_seed{seed}.glb"
    postprocessing_utils.to_glb(out["gaussian"][0], out["mesh"][0], simplify=simplify, texture_size=texture_size, verbose=False).export(glb)
    print("Saved", video, "and", glb)
    return Video(video, embed=True, width=512, html_attributes="controls autoplay loop muted")
