export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const { phone, email } = req.body || {};

	// EMAIL COMMUNITY SIGNUP
	if (typeof email === "string") {
	  const normalizedEmail = email.trim().toLowerCase();

	  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	  if (
		normalizedEmail.length > 254 ||
		!emailPattern.test(normalizedEmail)
	  ) {
		return res.status(400).json({
		  ok: false,
		  error: "Enter a valid email address"
		});
	  }

	  const apiKey = process.env.KLAVIYO_PRIVATE_API_KEY;

	  if (!apiKey) {
		console.error("Klaviyo API key is not configured");

		return res.status(500).json({
		  ok: false,
		  error: "Email signup is temporarily unavailable"
		});
	  }

	  const response = await fetch(
		"https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs",
		{
		  method: "POST",

		  headers: {
			Authorization: `Klaviyo-API-Key ${apiKey}`,
			Accept: "application/vnd.api+json",
			"Content-Type": "application/vnd.api+json",
			Revision: "2026-07-15"
		  },

		  body: JSON.stringify({
			data: {
			  type: "profile-subscription-bulk-create-job",

			  attributes: {
				profiles: {
				  data: [
					{
					  type: "profile",

					  attributes: {
						email: normalizedEmail,

						subscriptions: {
						  email: {
							marketing: {
							  consent: "SUBSCRIBED"
							}
						  }
						}
					  }
					}
				  ]
				},

				historical_import: false
			  },

			  relationships: {
				list: {
				  data: {
					type: "list",
					id: "T6q49x"
				  }
				}
			  }
			}
		  })
		}
	  );

	  const responseText = await response.text();

	  if (!response.ok) {
		console.error(
		  "Klaviyo email subscription error:",
		  response.status,
		  responseText
		);

		return res.status(502).json({
		  ok: false,
		  error: "Unable to subscribe right now. Please try again."
		});
	  }

	  return res.status(200).json({
		ok: true,
		message: "Subscription request accepted"
	  });
	}

    if (typeof phone !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Phone is required"
      });
    }

    let digits = phone.replace(/\D/g, "");

    if (
      digits.length === 11 &&
      digits.startsWith("1")
    ) {
      digits = digits.slice(1);
    }

    if (digits.length !== 10) {
      return res.status(400).json({
        ok: false,
        error: "Invalid US phone number"
      });
    }

    const phoneNumber = `+1${digits}`;

    const headers = {
      Authorization:
        `Klaviyo-API-Key ${process.env.KLAVIYO_PRIVATE_API_KEY}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Revision: "2026-07-15"
    };


    /*
     * STEP 1
     * Create or update profile.
     * NO SMS SUBSCRIPTION.
     */
    const profileResponse = await fetch(
      "https://a.klaviyo.com/api/profile-import",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: {
            type: "profile",
            attributes: {
              phone_number: phoneNumber
            }
          }
        })
      }
    );

    const profileData =
      await profileResponse.json().catch(() => null);

    if (!profileResponse.ok) {
      console.error(
        "Klaviyo profile error:",
        profileData
      );

      return res.status(profileResponse.status).json({
        ok: false,
        error:
          profileData?.errors?.[0]?.detail ||
          "Klaviyo profile creation failed"
      });
    }


    const profileId =
      profileData?.data?.id;

    if (!profileId) {
      return res.status(500).json({
        ok: false,
        error: "Klaviyo profile ID not returned"
      });
    }


    /*
     * STEP 2
     * Add profile to TMM3 list.
     * Does NOT change subscription status.
     */
    const listResponse = await fetch(
      "https://a.klaviyo.com/api/lists/T6q49x/relationships/profiles",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          data: [
            {
              type: "profile",
              id: profileId
            }
          ]
        })
      }
    );

    const listText =
      await listResponse.text();

    if (!listResponse.ok) {
      console.error(
        "Klaviyo list error:",
        listResponse.status,
        listText
      );

      return res.status(listResponse.status).json({
        ok: false,
        error:
          "Profile created, but could not be added to list"
      });
    }


    console.log(
      "Klaviyo profile created/updated:",
      profileId
    );

    console.log(
      "Klaviyo profile added to list:",
      "T6q49x"
    );


    return res.status(200).json({
      ok: true,
      profileId
    });

  } catch (error) {

    console.error(
      "Klaviyo server error:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
}