export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function avg(arr, s, e) {
    let sum = 0;
    for (let i = s; i < e; i++) sum += arr[i];
    return sum / (e - s);
}
