import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  callbacks: {
    async signIn({ profile }) {
      // Only your GitHub account can log in
      return profile?.login === process.env.GITHUB_USERNAME;
    },
  },
});
