// Imported first by the main entry, before anything touches the filesystem or DNS: libuv sizes
// its threadpool on first use, and the default of 4 threads is shared by every part-file write
// and every DNS lookup. With a dozen or more streams writing at hundreds of Mbps, those 4 threads
// become a queue the downloads wait in.
process.env['UV_THREADPOOL_SIZE'] ??= '16'

export {}
