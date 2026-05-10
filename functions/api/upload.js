export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        // 1. Initial validation
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file) {
            return new Response(
                JSON.stringify({ success: false, error: "No file provided" }), 
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        // 2. Generate a unique filename
	const uuid = crypto.randomUUID().split('-').pop(); // get last part as hex string
        const datePart = new Date().toISOString().split('T')[0];
        const filename = `${uuid}-${datePart}.bz2`;

        // 3. Stream directly to R2
        // Uses the 'BUCKET' binding you set in the dashboard
        await env.BUCKET.put(
            filename,
            file.stream(),
            {
                httpMetadata: {
                    contentType: file.type || "application/octet-stream"
                }
            }
        );

        // 4. Construct the return URL
        // Replace with your actual R2 Custom Domain (e.g. files.yourdomain.com)
        const publicUrl = `https://r2.xwords.top/${filename}`;

        return new Response(
            JSON.stringify({ success: true, url: publicUrl }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );

    } catch (err) {
        return new Response(
            JSON.stringify({ success: false, error: err.message }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
