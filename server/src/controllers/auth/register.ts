import bcrypt from "bcrypt";
import { KoaController } from "../../utils/KoaController";
import { ORMContext } from "../../server";
import { User } from "../../models/user.model";
import { FilterFrontendKeys } from "../../utils/FrontendKey";
import {
  authFailureErr,
  emailUniqueErr,
  usernameUniqueErr,
} from "../../errors/errors";
import { logging } from "../../utils/logger";
import { Status } from "../../enums/StatusCodes";
import { ClientSafeError } from "../../middleware/clientSafeError";
import { UserRegistrationSchema } from "./zod/AuthSchemas";

/**
 * Controller to handle user registration.
 *
 * This controller registers a new user based on the provided input. It hashes the user's
 * password, saves the user to the database, and returns the filtered user information.
 * If registration fails, it throws an authentication failure error.
 *
 * @param {Context} ctx - The Koa context object.
 * @returns {Promise<void>} - A promise that resolves when the controller is complete.
 * @throws {Error} - Throws an error if registration fails or if the request body is invalid.
 */
export const register: KoaController = async (ctx) => {
  try {
    const registeredUser = UserRegistrationSchema.parse(ctx.request.body);

    // Find user by username or email
    const existingUser = await ORMContext.em.findOne(User, {
      $or: [
        { username: registeredUser.username },
        { email: registeredUser.email },
      ],
    });

    // If user exists, check if username or email is already taken
    if (existingUser) {
      const isUsernameTaken = existingUser.username === registeredUser.username;
      const isEmailTaken = existingUser.email === registeredUser.email;

      if (isUsernameTaken) throw usernameUniqueErr();
      if (isEmailTaken) throw emailUniqueErr();
    }

    const hash = await bcrypt.hash(registeredUser.password, 10);

    // Create new user record
    const user = ORMContext.em.create(User, {
      ...registeredUser,
      password: hash,
    });

    await ORMContext.em.persistAndFlush(user);
    const filteredUser = FilterFrontendKeys(user);
    logging(
      `User ${filteredUser.username} registered successfully | ID: ${filteredUser.userid} | Email: ${filteredUser.email} | IP Address: ${ctx.ip}`
    );

    ctx.status = Status.OK;
    ctx.body = { user: filteredUser };
  } catch (err) {
    if (err instanceof ClientSafeError) {
      ctx.status = err.status;
      ctx.body = { message: err.message, code: err.code };
    } else throw authFailureErr();
  }
};