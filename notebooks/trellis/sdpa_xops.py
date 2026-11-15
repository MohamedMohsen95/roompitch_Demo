# Stands in for xformers.ops in TRELLIS's sparse attention, on PyTorch's scaled_dot_product_attention.
# Layout as xformers: [B, N, H, C]. A block-diagonal mask (many sequences packed into one) is run as one batched call
# per distinct (query, key) length, so thousands of small windows cost a few hundred calls at most.
import torch
import torch.nn.functional as F


class _BlockDiagonalMask:
    def __init__(self, q_seqlen, kv_seqlen=None):
        self.q_seqlen = [int(n) for n in q_seqlen]
        self.kv_seqlen = [int(n) for n in (kv_seqlen if kv_seqlen is not None else q_seqlen)]


class fmha:
    class BlockDiagonalMask:
        @staticmethod
        def from_seqlens(q_seqlen, kv_seqlen=None):
            return _BlockDiagonalMask(q_seqlen, kv_seqlen)


def _sdpa(q, k, v):
    return F.scaled_dot_product_attention(q.transpose(1, 2), k.transpose(1, 2), v.transpose(1, 2)).transpose(1, 2)


def memory_efficient_attention(q, k, v, attn_bias=None):
    if attn_bias is None:
        return _sdpa(q, k, v)
    q0, k0, v0 = q[0], k[0], v[0]
    out = q0.new_zeros(q0.shape[0], q0.shape[1], v0.shape[2])
    groups, qs, ks = {}, 0, 0
    for lq, lk in zip(attn_bias.q_seqlen, attn_bias.kv_seqlen):
        if lq and lk:
            groups.setdefault((lq, lk), ([], []))
            groups[(lq, lk)][0].append(qs)
            groups[(lq, lk)][1].append(ks)
        qs += lq
        ks += lk
    for (lq, lk), (q_starts, k_starts) in groups.items():
        iq = torch.tensor(q_starts, device=q0.device)[:, None] + torch.arange(lq, device=q0.device)
        ik = torch.tensor(k_starts, device=q0.device)[:, None] + torch.arange(lk, device=q0.device)
        out[iq] = _sdpa(q0[iq], k0[ik], v0[ik])
    return out.unsqueeze(0)
