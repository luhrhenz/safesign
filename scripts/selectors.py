#!/usr/bin/env python3
"""
Generate the 4-byte function selectors used by lib/checks/bytecode.ts.

Build-time only — it adds no runtime dependency. Keccak-256 is implemented here
because Python ships NIST SHA3, which differs from Keccak in one padding byte
and therefore produces different selectors. The implementation is checked
against published values before it is allowed to print anything.

    python3 scripts/selectors.py
"""

RC = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
]
ROT = [
    [0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56], [27, 20, 39, 8, 14],
]
MASK = (1 << 64) - 1


def rol(x, n):
    return ((x << n) | (x >> (64 - n))) & MASK


def keccak_f(a):
    for rnd in range(24):
        c = [a[x][0] ^ a[x][1] ^ a[x][2] ^ a[x][3] ^ a[x][4] for x in range(5)]
        d = [c[(x - 1) % 5] ^ rol(c[(x + 1) % 5], 1) for x in range(5)]
        for x in range(5):
            for y in range(5):
                a[x][y] ^= d[x]

        b = [[0] * 5 for _ in range(5)]
        for x in range(5):
            for y in range(5):
                b[y][(2 * x + 3 * y) % 5] = rol(a[x][y], ROT[x][y])

        for x in range(5):
            for y in range(5):
                a[x][y] = b[x][y] ^ ((~b[(x + 1) % 5][y] & MASK) & b[(x + 2) % 5][y])

        a[0][0] ^= RC[rnd]
    return a


def keccak256(data: bytes) -> bytes:
    rate = 136  # 1088 bits, the rate for Keccak-256
    padded = bytearray(data)
    padded.append(0x01)  # Keccak padding. SHA3 uses 0x06 — this is the difference.
    while len(padded) % rate:
        padded.append(0x00)
    padded[-1] |= 0x80

    state = [[0] * 5 for _ in range(5)]
    for offset in range(0, len(padded), rate):
        block = padded[offset:offset + rate]
        for i in range(rate // 8):
            word = int.from_bytes(block[i * 8:(i + 1) * 8], "little")
            state[i % 5][i // 5] ^= word
        state = keccak_f(state)

    out = b""
    for i in range(4):
        out += state[i % 5][i // 5].to_bytes(8, "little")
    return out[:32]


def selector(signature: str) -> str:
    return "0x" + keccak256(signature.encode()).hex()[:8]


# Published values. If any of these fail the implementation is wrong and no
# selector below can be trusted.
VECTORS = {
    "": "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    "abc": "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
}
KNOWN_SELECTORS = {
    "transferFrom(address,address,uint256)": "0x23b872dd",
    "setApprovalForAll(address,bool)": "0xa22cb465",
    "approve(address,uint256)": "0x095ea7b3",
    "balanceOf(address)": "0x70a08231",
    "owner()": "0x8da5cb5b",
    "token0()": "0x0dfe1681",
}

if __name__ == "__main__":
    for text, expected in VECTORS.items():
        got = keccak256(text.encode()).hex()
        assert got == expected, f"keccak256({text!r}) = {got}, expected {expected}"
    for sig, expected in KNOWN_SELECTORS.items():
        got = selector(sig)
        assert got == expected, f"{sig} = {got}, expected {expected}"
    print("keccak-256 verified against published vectors and selectors\n")

    # Signatures worth recognising in bytecode when no source is published.
    SIGNATURES = [
        # Wallet-drainer bait: names that only appear on phishing contracts.
        "SecurityUpdate()", "Claim()", "ClaimRewards()", "ClaimReward()",
        "Connect()", "Verify()", "Airdrop()", "Swap()", "Execute()",
        "SecurityUpdate(address)", "Claim(address)",
        # Sweeping other people's balances.
        "multicall(bytes[])", "multiSend(bytes)",
        "transferFrom(address,address,uint256)", "setApprovalForAll(address,bool)",
        "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)",
        # Owner powers, for contracts with no source to read.
        "mint(address,uint256)", "pause()", "unpause()",
        "blacklist(address)", "addBlackList(address)", "setBlacklist(address,bool)",
        "upgradeTo(address)", "upgradeToAndCall(address,bytes)",
    ]
    for sig in SIGNATURES:
        print(f'  "{selector(sig)}": "{sig}",')
